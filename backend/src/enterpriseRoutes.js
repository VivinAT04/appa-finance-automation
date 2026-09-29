const express = require("express");
const { randomUUID } = require("crypto");

const db = require("./database");

const {
  matchInvoice,
  getMatch,
} = require("./matchingService");

const {
  seedEnterpriseData,
} = require("./seedEnterpriseData");

const {
  runScenarios,
  seedScenarios,
  getScenarioInvoices,
  getScenarioResults,
  removeScenarioData,
} = require("./scenarioService");

const router = express.Router();

/* =========================================================
   HELPERS
   ========================================================= */

function createAudit(
  organisationId,
  action,
  entityType,
  entityId,
  description
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required for enterprise audit events."
    );
  }

  db.prepare(`
    INSERT INTO audit_logs (
      id,
      action,
      entity_type,
      entity_id,
      description,
      created_at,
      organisation_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    action,
    entityType,
    entityId,
    description,
    new Date().toISOString(),
    organisationId
  );
}

/* =========================================================
   SUPPLIERS
   ========================================================= */

router.get(
  "/suppliers",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const suppliers = db.prepare(`
      SELECT
        id,
        supplier_code AS supplierCode,
        name,
        email,
        tax_id AS taxId,
        payment_terms_days AS paymentTermsDays,
        status,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM suppliers
      WHERE organisation_id = ?
      ORDER BY name
    `).all(organisationId);

    res.json({
      success: true,
      suppliers,
    });
  }
);

/* =========================================================
   PURCHASE ORDERS
   ========================================================= */

router.get(
  "/purchase-orders",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const purchaseOrders = db.prepare(`
      SELECT
        po.id,
        po.po_number AS poNumber,
        po.supplier_id AS supplierId,
        s.name AS supplierName,
        s.supplier_code AS supplierCode,
        po.order_date AS orderDate,
        po.currency,
        po.subtotal,
        po.tax_amount AS taxAmount,
        po.total_amount AS totalAmount,
        po.status,
        po.created_at AS createdAt,
        po.updated_at AS updatedAt
      FROM purchase_orders po

      INNER JOIN suppliers s
        ON s.id = po.supplier_id
        AND s.organisation_id =
            po.organisation_id

      WHERE
        po.organisation_id = ?

      ORDER BY
        po.created_at DESC
    `).all(organisationId);

    res.json({
      success: true,
      purchaseOrders,
    });
  }
);

router.get(
  "/purchase-orders/:id",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const purchaseOrder =
      db.prepare(`
        SELECT
          po.id,
          po.po_number AS poNumber,
          po.supplier_id AS supplierId,
          s.name AS supplierName,
          s.supplier_code AS supplierCode,
          s.email AS supplierEmail,
          po.order_date AS orderDate,
          po.currency,
          po.subtotal,
          po.tax_amount AS taxAmount,
          po.total_amount AS totalAmount,
          po.status,
          po.created_at AS createdAt,
          po.updated_at AS updatedAt
        FROM purchase_orders po

        INNER JOIN suppliers s
          ON s.id = po.supplier_id
          AND s.organisation_id =
              po.organisation_id

        WHERE
          po.id = ?
          AND po.organisation_id = ?
      `).get(
        req.params.id,
        organisationId
      );

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message:
          "Purchase order not found.",
      });
    }

    purchaseOrder.lineItems =
      db.prepare(`
        SELECT
          poi.id,
          poi.description,
          poi.quantity,
          poi.unit_price AS unitPrice,
          poi.line_total AS lineTotal,
          poi.position
        FROM purchase_order_items poi

        INNER JOIN purchase_orders po
          ON po.id =
             poi.purchase_order_id

        WHERE
          poi.purchase_order_id = ?
          AND po.organisation_id = ?

        ORDER BY poi.position
      `).all(
        purchaseOrder.id,
        organisationId
      );

    res.json({
      success: true,
      purchaseOrder,
    });
  }
);

/* =========================================================
   PO MATCHING
   ========================================================= */

router.post(
  "/matching/:invoiceId",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const match =
        matchInvoice(
          req.params.invoiceId,
          organisationId
        );

      res.json({
        success: true,
        match,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/matching/:invoiceId",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const match =
      getMatch(
        req.params.invoiceId,
        organisationId
      );

    if (!match) {
      return res.status(404).json({
        success: false,
        message:
          "No matching result exists for this invoice.",
      });
    }

    res.json({
      success: true,
      match,
    });
  }
);


/* =========================================================
   FINANCE OPERATIONS SUMMARY
   ========================================================= */

router.get(
  "/operations-summary",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const openExceptions =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            e.status = 'Open'
            AND d.organisation_id = ?
        `).get(
          organisationId
        ).count;

      const pendingApprovals =
        db.prepare(`
          SELECT COUNT(*) AS count
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          INNER JOIN invoice_matches m
            ON m.invoice_id = i.id

          WHERE
            d.organisation_id = ?
            AND m.match_status = 'Matched'

            AND NOT EXISTS (
              SELECT 1
              FROM exceptions e
              WHERE
                e.invoice_id = i.id
                AND e.status = 'Open'
            )

            AND NOT EXISTS (
              SELECT 1
              FROM approvals a
              WHERE a.invoice_id = i.id
            )
        `).get(
          organisationId
        ).count;

      const exceptionInvoices =
        db.prepare(`
          SELECT
            COUNT(
              DISTINCT e.invoice_id
            ) AS count
          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            e.status = 'Open'
            AND d.organisation_id = ?
        `).get(
          organisationId
        ).count;

      const latestAutomation =
        db.prepare(`
          SELECT
            id,
            process_name AS processName,
            source,
            status,
            started_at AS startedAt,
            completed_at AS completedAt
          FROM automation_runs
          WHERE organisation_id = ?
          ORDER BY started_at DESC
          LIMIT 1
        `).get(
          organisationId
        ) || null;

      res.json({
        success: true,
        summary: {
          pendingApprovals,
          openExceptions,
          exceptionInvoices,
          automationStatus:
            latestAutomation?.status ||
            "Idle",
          latestAutomation,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/approvals/pending",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const pending =
        db.prepare(`
          SELECT
            i.id AS invoiceId,
            i.invoice_number AS invoiceNumber,
            i.supplier_name AS supplierName,
            i.currency,
            i.total_amount AS totalAmount,
            i.purchase_order_number
              AS purchaseOrderNumber,
            i.invoice_date AS invoiceDate,
            i.due_date AS dueDate,
            i.extraction_confidence
              AS extractionConfidence,
            i.validation_status
              AS validationStatus,

            m.match_score AS matchScore,
            m.match_status AS matchStatus,
            m.variance_amount
              AS varianceAmount,
            m.updated_at AS matchedAt,

            (
              SELECT COUNT(*)
              FROM exceptions e
              WHERE
                e.invoice_id = i.id
                AND e.status = 'Open'
            ) AS openExceptionCount

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          INNER JOIN invoice_matches m
            ON m.invoice_id = i.id

          WHERE
            d.organisation_id = ?
            AND m.match_status = 'Matched'

            AND NOT EXISTS (
              SELECT 1
              FROM exceptions e
              WHERE
                e.invoice_id = i.id
                AND e.status = 'Open'
            )

            AND NOT EXISTS (
              SELECT 1
              FROM approvals a
              WHERE a.invoice_id = i.id
            )

          ORDER BY
            m.updated_at DESC
        `).all(
          organisationId
        );

      res.json({
        success: true,
        pending,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   APPROVALS
   ========================================================= */

router.get(
  "/approvals",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const approvals =
      db.prepare(`
        SELECT
          a.id,
          a.invoice_id AS invoiceId,

          i.invoice_number AS invoiceNumber,
          i.supplier_name AS supplierName,
          i.currency,
          i.total_amount AS totalAmount,

          a.decision,
          a.approval_type AS approvalType,
          a.approver,
          a.comments,
          a.created_at AS createdAt

        FROM approvals a

        INNER JOIN invoices i
          ON i.id = a.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          d.organisation_id = ?

        ORDER BY
          a.created_at DESC
      `).all(
        organisationId
      );

    res.json({
      success: true,
      approvals,
    });
  }
);

router.post(
  "/approvals/:invoiceId",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const {
      decision,
      comments = "",
      approver =
        req.user?.fullName ||
        req.user?.email ||
        "Authenticated User",
    } = req.body || {};

    if (
      ![
        "Approved",
        "Rejected",
      ].includes(decision)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Decision must be Approved or Rejected.",
      });
    }

    const invoice =
      db.prepare(`
        SELECT i.*
        FROM invoices i

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          i.id = ?
          AND d.organisation_id = ?
      `).get(
        req.params.invoiceId,
        organisationId
      );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message:
          "Invoice not found.",
      });
    }

    const openExceptionCount =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          e.invoice_id = ?
          AND e.status = 'Open'
          AND d.organisation_id = ?
      `).get(
        invoice.id,
        organisationId
      ).count;

    if (
      decision === "Approved" &&
      openExceptionCount > 0
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Invoice cannot be approved while open exceptions exist.",
      });
    }

    const approvalId =
      randomUUID();

    const createdAt =
      new Date().toISOString();

    db.prepare(`
      INSERT INTO approvals (
        id,
        invoice_id,
        decision,
        approval_type,
        approver,
        comments,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      approvalId,
      invoice.id,
      decision,
      "Manual",
      String(approver).trim() ||
        "Authenticated User",
      String(comments || "").trim(),
      createdAt
    );

    createAudit(
      organisationId,
      "INVOICE_APPROVAL_RECORDED",
      "approval",
      approvalId,
      `${invoice.invoice_number}: ${decision}`
    );

    const approval =
      db.prepare(`
        SELECT
          a.id,
          a.invoice_id AS invoiceId,
          a.decision,
          a.approval_type AS approvalType,
          a.approver,
          a.comments,
          a.created_at AS createdAt
        FROM approvals a

        INNER JOIN invoices i
          ON i.id = a.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          a.id = ?
          AND d.organisation_id = ?
      `).get(
        approvalId,
        organisationId
      );

    res.status(201).json({
      success: true,
      approval,
    });
  }
);

/* =========================================================
   EXCEPTIONS
   ========================================================= */

router.get(
  "/exceptions",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const exceptions =
      db.prepare(`
        SELECT
          e.id,
          e.invoice_id AS invoiceId,

          i.invoice_number AS invoiceNumber,
          i.supplier_name AS supplierName,
          i.currency,
          i.total_amount AS totalAmount,

          e.exception_type AS exceptionType,
          e.severity,
          e.description,
          e.status,
          e.resolution,
          e.created_at AS createdAt,
          e.resolved_at AS resolvedAt

        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          d.organisation_id = ?

        ORDER BY
          CASE e.status
            WHEN 'Open' THEN 0
            ELSE 1
          END,
          e.created_at DESC
      `).all(
        organisationId
      );

    res.json({
      success: true,
      exceptions,
    });
  }
);

router.post(
  "/exceptions/:id/resolve",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const resolution =
      String(
        req.body?.resolution || ""
      ).trim();

    if (!resolution) {
      return res.status(400).json({
        success: false,
        message:
          "Resolution is required.",
      });
    }

    const exception =
      db.prepare(`
        SELECT
          e.*,
          i.invoice_number AS invoiceNumber
        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          e.id = ?
          AND d.organisation_id = ?
      `).get(
        req.params.id,
        organisationId
      );

    if (!exception) {
      return res.status(404).json({
        success: false,
        message:
          "Exception not found.",
      });
    }

    const now =
      new Date().toISOString();

    const update =
      db.prepare(`
        UPDATE exceptions
        SET
          status = 'Resolved',
          resolution = ?,
          resolved_at = ?
        WHERE
          id = ?
          AND invoice_id IN (
            SELECT i.id
            FROM invoices i

            INNER JOIN documents d
              ON d.id = i.document_id

            WHERE
              d.organisation_id = ?
          )
      `).run(
        resolution,
        now,
        exception.id,
        organisationId
      );

    if (update.changes !== 1) {
      return res.status(404).json({
        success: false,
        message:
          "Exception not found.",
      });
    }

    createAudit(
      organisationId,
      "EXCEPTION_RESOLVED",
      "exception",
      exception.id,
      `${exception.invoiceNumber}: ${resolution}`
    );

    const resolved =
      db.prepare(`
        SELECT
          e.id,
          e.invoice_id AS invoiceId,
          e.exception_type AS exceptionType,
          e.severity,
          e.description,
          e.status,
          e.resolution,
          e.created_at AS createdAt,
          e.resolved_at AS resolvedAt
        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          e.id = ?
          AND d.organisation_id = ?
      `).get(
        exception.id,
        organisationId
      );

    res.json({
      success: true,
      exception: resolved,
    });
  }
);

/* =========================================================
   AUTOMATION RUNS
   ========================================================= */

router.get(
  "/automation-runs",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const runs = db.prepare(`
      SELECT
        id,
        process_name AS processName,
        source,
        status,
        items_processed AS itemsProcessed,
        items_succeeded AS itemsSucceeded,
        items_failed AS itemsFailed,
        started_at AS startedAt,
        completed_at AS completedAt,
        details
      FROM automation_runs
      WHERE organisation_id = ?
      ORDER BY started_at DESC
      LIMIT 100
    `).all(
      organisationId
    );

    res.json({
      success: true,
      runs,
    });
  }
);

router.post(
  "/automation/run-ap-cycle",
  (req, res, next) => {
    const organisationId =
      req.organisation.id;

    const runId =
      randomUUID();

    const startedAt =
      new Date().toISOString();

    const source =
      req.body?.source ||
      "APPA Engine";

    db.prepare(`
      INSERT INTO automation_runs (
        id,
        process_name,
        source,
        status,
        started_at,
        details,
        organisation_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      "Accounts Payable Matching Cycle",
      source,
      "Running",
      startedAt,
      "Processing validated invoices through the APPA PO matching engine.",
      organisationId
    );

    try {
      const invoices =
        db.prepare(`
          SELECT i.id
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            i.validation_status =
              'Validated'
            AND d.organisation_id = ?
        `).all(
          organisationId
        );

      let succeeded = 0;
      let failed = 0;

      for (
        const invoice
        of invoices
      ) {
        try {
          const matchResult =
            matchInvoice(
              invoice.id,
              organisationId
            );

          if (
            matchResult?.matchStatus ===
            "Matched"
          ) {
            succeeded += 1;
          } else {
            failed += 1;
          }
        } catch (error) {
          console.error(
            "Invoice automation failure:",
            invoice.id,
            error.message
          );

          failed += 1;
        }
      }

      const completedAt =
        new Date().toISOString();

      const status =
        failed > 0
          ? "Completed with exceptions"
          : "Completed";

      const update =
        db.prepare(`
          UPDATE automation_runs
          SET
            status = ?,
            items_processed = ?,
            items_succeeded = ?,
            items_failed = ?,
            completed_at = ?,
            details = ?
          WHERE
            id = ?
            AND organisation_id = ?
        `).run(
          status,
          invoices.length,
          succeeded,
          failed,
          completedAt,
          `Processed ${invoices.length} validated invoice(s).`,
          runId,
          organisationId
        );

      if (update.changes !== 1) {
        throw new Error(
          "Automation run ownership validation failed."
        );
      }

      createAudit(
        organisationId,
        "AUTOMATION_RUN_COMPLETED",
        "automation_run",
        runId,
        `AP cycle processed ${invoices.length} invoice(s): ${succeeded} succeeded, ${failed} failed`
      );

      const run =
        db.prepare(`
          SELECT
            id,
            process_name AS processName,
            source,
            status,
            items_processed AS itemsProcessed,
            items_succeeded AS itemsSucceeded,
            items_failed AS itemsFailed,
            started_at AS startedAt,
            completed_at AS completedAt,
            details
          FROM automation_runs
          WHERE
            id = ?
            AND organisation_id = ?
        `).get(
          runId,
          organisationId
        );

      res.json({
        success: true,
        run,
      });
    } catch (error) {
      db.prepare(`
        UPDATE automation_runs
        SET
          status = 'Failed',
          completed_at = ?,
          details = ?
        WHERE
          id = ?
          AND organisation_id = ?
      `).run(
        new Date().toISOString(),
        error.message,
        runId,
        organisationId
      );

      next(error);
    }
  }
);

/* =========================================================
   DASHBOARD
   ========================================================= */

router.get(
  "/dashboard",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      function scalar(
        sql,
        params = [organisationId]
      ) {
        const row =
          db.prepare(sql).get(...params);

        return Number(
          row?.value || 0
        );
      }

      const dashboard = {
        documents: scalar(`
          SELECT COUNT(*) AS value
          FROM documents
          WHERE organisation_id = ?
        `),

        invoices: scalar(`
          SELECT COUNT(*) AS value
          FROM invoices i
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE d.organisation_id = ?
        `),

        invoiceValue: scalar(`
          SELECT
            COALESCE(
              SUM(i.total_amount),
              0
            ) AS value
          FROM invoices i
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE d.organisation_id = ?
        `),

        suppliers: scalar(`
          SELECT COUNT(*) AS value
          FROM suppliers
          WHERE organisation_id = ?
        `),

        purchaseOrders: scalar(`
          SELECT COUNT(*) AS value
          FROM purchase_orders
          WHERE organisation_id = ?
        `),

        matchedInvoices: scalar(`
          SELECT COUNT(*) AS value
          FROM invoice_matches im
          INNER JOIN invoices i
            ON i.id = im.invoice_id
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE
            im.match_status = 'Matched'
            AND d.organisation_id = ?
        `),

        openExceptions: scalar(`
          SELECT COUNT(*) AS value
          FROM exceptions e
          INNER JOIN invoices i
            ON i.id = e.invoice_id
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE
            e.status = 'Open'
            AND d.organisation_id = ?
        `),

        approvals: scalar(`
          SELECT COUNT(*) AS value
          FROM approvals a
          INNER JOIN invoices i
            ON i.id = a.invoice_id
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE
            a.decision = 'Approved'
            AND d.organisation_id = ?
        `),

        automationRuns: scalar(`
          SELECT COUNT(*) AS value
          FROM automation_runs
          WHERE organisation_id = ?
        `),
      };

      const pendingApprovals =
        scalar(`
          SELECT COUNT(*) AS value
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = ?

            AND NOT EXISTS (
              SELECT 1
              FROM approvals a
              WHERE
                a.invoice_id = i.id
                AND a.decision = 'Approved'
            )
        `);

      const pendingApprovalValue =
        scalar(`
          SELECT
            COALESCE(
              SUM(i.total_amount),
              0
            ) AS value

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = ?

            AND NOT EXISTS (
              SELECT 1
              FROM approvals a
              WHERE
                a.invoice_id = i.id
                AND a.decision = 'Approved'
            )
        `);

      const automationTotals =
        db.prepare(`
          SELECT
            COALESCE(
              SUM(items_processed),
              0
            ) AS processed,

            COALESCE(
              SUM(items_succeeded),
              0
            ) AS succeeded,

            COALESCE(
              SUM(items_failed),
              0
            ) AS failed

          FROM automation_runs
          WHERE organisation_id = ?
        `).get(
          organisationId
        );

      const processedItems =
        Number(
          automationTotals?.processed || 0
        );

      const succeededItems =
        Number(
          automationTotals?.succeeded || 0
        );

      const automationSuccessRate =
        processedItems > 0
          ? Number(
              (
                succeededItems /
                processedItems *
                100
              ).toFixed(1)
            )
          : 0;

      const recentTransactions =
        db.prepare(`
          SELECT
            i.id,
            i.invoice_number AS invoice,
            i.supplier_name AS supplier,
            i.currency,

            COALESCE(
              i.total_amount,
              0
            ) AS amount,

            i.validation_status
              AS validationStatus,

            i.updated_at AS updatedAt,

            im.match_status
              AS matchStatus,

            (
              SELECT a.decision
              FROM approvals a
              WHERE
                a.invoice_id = i.id
              ORDER BY
                a.created_at DESC
              LIMIT 1
            ) AS approvalDecision,

            (
              SELECT COUNT(*)
              FROM exceptions e
              WHERE
                e.invoice_id = i.id
                AND e.status = 'Open'
            ) AS openExceptionCount

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          LEFT JOIN invoice_matches im
            ON im.invoice_id = i.id

          WHERE
            d.organisation_id = ?

          ORDER BY
            datetime(i.updated_at) DESC,
            i.updated_at DESC

          LIMIT 5
        `).all(
          organisationId
        ).map((row) => {
          let status = "Processing";

          if (
            Number(
              row.openExceptionCount
            ) > 0
          ) {
            status = "Exception";
          } else if (
            row.approvalDecision ===
            "Approved"
          ) {
            status = "Completed";
          } else if (
            row.matchStatus ===
            "Matched"
          ) {
            status = "Approval";
          } else if (
            row.validationStatus ===
            "Validated"
          ) {
            status = "Processing";
          }

          return {
            ...row,
            status,
          };
        });

      const recentAutomationRuns =
        db.prepare(`
          SELECT
            id,
            process_name AS title,
            source AS subtitle,
            status,
            items_processed AS itemsProcessed,
            items_succeeded AS itemsSucceeded,
            items_failed AS itemsFailed,
            started_at AS startedAt,
            completed_at AS completedAt

          FROM automation_runs

          WHERE
            organisation_id = ?

          ORDER BY
            datetime(started_at) DESC,
            started_at DESC

          LIMIT 3
        `).all(
          organisationId
        );

      const dailyVolume =
        db.prepare(`
          WITH RECURSIVE days(day) AS (
            SELECT date('now', '-6 days')

            UNION ALL

            SELECT date(day, '+1 day')
            FROM days
            WHERE day < date('now')
          )

          SELECT
            days.day AS date,
            COUNT(i.id) AS count

          FROM days

          LEFT JOIN (
            SELECT
              i.id,
              i.created_at
            FROM invoices i

            INNER JOIN documents d
              ON d.id = i.document_id

            WHERE
              d.organisation_id = ?
          ) i
            ON date(i.created_at) =
               days.day

          GROUP BY days.day
          ORDER BY days.day
        `).all(
          organisationId
        );

      const mismatchCount =
        scalar(`
          SELECT COUNT(*) AS value

          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            e.status = 'Open'
            AND d.organisation_id = ?

            AND (
              UPPER(e.exception_type)
                LIKE '%MISMATCH%'

              OR UPPER(e.exception_type)
                LIKE '%AMOUNT%'

              OR UPPER(e.exception_type)
                LIKE '%LINE%'
            )
        `);

      const lowConfidenceDocuments =
        scalar(`
          SELECT COUNT(*) AS value

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = ?

            AND COALESCE(
              i.extraction_confidence,
              0
            ) < 80
        `);

      const overdueApprovals =
        scalar(`
          SELECT COUNT(*) AS value

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = ?

            AND datetime(i.created_at)
              <= datetime(
                'now',
                '-24 hours'
              )

            AND NOT EXISTS (
              SELECT 1
              FROM approvals a
              WHERE
                a.invoice_id = i.id
                AND a.decision =
                  'Approved'
            )
        `);

      const openHighSeverityExceptions =
        scalar(`
          SELECT COUNT(*) AS value

          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            e.status = 'Open'
            AND UPPER(e.severity) =
              'HIGH'
            AND d.organisation_id = ?
        `);

      res.json({
        success: true,

        dashboard: {
          ...dashboard,

          pendingApprovals,
          pendingApprovalValue,

          automation: {
            processed:
              processedItems,

            succeeded:
              succeededItems,

            failed:
              Number(
                automationTotals
                  ?.failed || 0
              ),

            successRate:
              automationSuccessRate,
          },

          recentTransactions,
          recentAutomationRuns,
          dailyVolume,

          attention: {
            mismatches:
              mismatchCount,

            lowConfidence:
              lowConfidenceDocuments,

            overdueApprovals,

            highSeverityExceptions:
              openHighSeverityExceptions,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   REPORTING
   ========================================================= */

router.get(
  "/reports",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const invoiceSummary =
        db.prepare(`
          SELECT
            i.currency,

            COUNT(*) AS invoiceCount,

            COALESCE(
              SUM(i.total_amount),
              0
            ) AS totalValue,

            COALESCE(
              AVG(
                i.extraction_confidence
              ),
              0
            ) AS averageConfidence

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = ?

          GROUP BY
            i.currency
        `).all(
          organisationId
        );

      const matchSummary =
        db.prepare(`
          SELECT
            im.match_status
              AS matchStatus,

            COUNT(*) AS count,

            COALESCE(
              AVG(im.match_score),
              0
            ) AS averageScore

          FROM invoice_matches im

          INNER JOIN invoices i
            ON i.id = im.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = ?

          GROUP BY
            im.match_status
        `).all(
          organisationId
        );

      const exceptionSummary =
        db.prepare(`
          SELECT
            e.exception_type
              AS exceptionType,

            e.status,

            COUNT(*) AS count

          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = ?

          GROUP BY
            e.exception_type,
            e.status

          ORDER BY
            count DESC
        `).all(
          organisationId
        );

      const automationSummary =
        db.prepare(`
          SELECT
            status,

            COUNT(*) AS runCount,

            COALESCE(
              SUM(items_processed),
              0
            ) AS itemsProcessed,

            COALESCE(
              SUM(items_succeeded),
              0
            ) AS itemsSucceeded,

            COALESCE(
              SUM(items_failed),
              0
            ) AS itemsFailed

          FROM automation_runs

          WHERE
            organisation_id = ?

          GROUP BY
            status
        `).all(
          organisationId
        );

      res.json({
        success: true,
        invoiceSummary,
        matchSummary,
        exceptionSummary,
        automationSummary,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   SETTINGS
   ========================================================= */

const DEFAULT_WORKFLOW_SETTINGS = [
  {
    key: "amount_tolerance",
    value: "1.00",
    description:
      "Maximum monetary variance permitted during invoice-to-PO matching.",
  },
  {
    key: "auto_approval_match_score",
    value: "100",
    description:
      "Minimum successful match score required for automatic approval.",
  },
  {
    key: "duplicate_detection",
    value: "true",
    description:
      "Enable duplicate invoice detection using invoice number, supplier and total amount.",
  },
];

function ensureWorkflowSettings(
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required for workflow settings."
    );
  }

  const findSetting =
    db.prepare(`
      SELECT
        setting_key,
        organisation_id
      FROM app_settings
      WHERE setting_key = ?
    `);

  const insertSetting =
    db.prepare(`
      INSERT INTO app_settings (
        setting_key,
        setting_value,
        description,
        updated_at,
        organisation_id
      )
      VALUES (?, ?, ?, ?, ?)
    `);

  const now =
    new Date().toISOString();

  const transaction =
    db.transaction(() => {
      for (
        const setting
        of DEFAULT_WORKFLOW_SETTINGS
      ) {
        const existing =
          findSetting.get(
            setting.key
          );

        if (existing) {
          if (
            existing.organisation_id !==
            organisationId
          ) {
            const error =
              new Error(
                `Workflow setting ${setting.key} belongs to another organisation. Per-organisation settings require the composite-key migration.`
              );

            error.status = 409;
            error.code =
              "SETTING_SCHEMA_MIGRATION_REQUIRED";

            throw error;
          }

          continue;
        }

        insertSetting.run(
          setting.key,
          setting.value,
          setting.description,
          now,
          organisationId
        );
      }
    });

  transaction();
}

router.get(
  "/settings",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      ensureWorkflowSettings(
        organisationId
      );

      const settings =
        db.prepare(`
          SELECT
            setting_key AS key,
            setting_value AS value,
            description,
            updated_at AS updatedAt
          FROM app_settings
          WHERE organisation_id = ?
          ORDER BY setting_key
        `).all(
          organisationId
        );

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  "/settings/:key",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      ensureWorkflowSettings(
        organisationId
      );

      const value =
        String(
          req.body?.value ?? ""
        ).trim();

      if (!value) {
        return res.status(400).json({
          success: false,
          message:
            "Setting value is required.",
        });
      }

      const setting =
        db.prepare(`
          SELECT *
          FROM app_settings
          WHERE
            setting_key = ?
            AND organisation_id = ?
        `).get(
          req.params.key,
          organisationId
        );

      if (!setting) {
        return res.status(404).json({
          success: false,
          message:
            "Setting not found.",
        });
      }

      const update =
        db.prepare(`
          UPDATE app_settings
          SET
            setting_value = ?,
            updated_at = ?
          WHERE
            setting_key = ?
            AND organisation_id = ?
        `).run(
          value,
          new Date().toISOString(),
          req.params.key,
          organisationId
        );

      if (update.changes !== 1) {
        return res.status(404).json({
          success: false,
          message:
            "Setting not found.",
        });
      }

      createAudit(
        organisationId,
        "SETTING_UPDATED",
        "setting",
        req.params.key,
        `${req.params.key} changed from ${setting.setting_value} to ${value}`
      );

      res.json({
        success: true,
        key: req.params.key,
        value,
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   RPA / UIPATH INTEGRATION CONTRACT

   These endpoints are integration points.
   They do NOT claim that UiPath is currently executing.
   ========================================================= */

router.get(
  "/rpa/work-items",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const workItems =
        db.prepare(`
          SELECT
            i.id AS invoiceId,
            i.invoice_number AS invoiceNumber,
            i.supplier_name AS supplierName,
            i.purchase_order_number AS purchaseOrderNumber,
            i.currency,
            i.total_amount AS totalAmount,
            i.extraction_confidence AS extractionConfidence,
            i.validation_status AS validationStatus,

            COALESCE(
              m.match_status,
              'Not Processed'
            ) AS matchStatus

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          LEFT JOIN invoice_matches m
            ON m.invoice_id = i.id

          WHERE
            d.organisation_id = ?

            AND i.validation_status =
              'Validated'

            AND (
              m.id IS NULL
              OR m.match_status <>
                'Matched'
            )

          ORDER BY
            i.created_at
        `).all(
          organisationId
        );

      res.json({
        success: true,
        queue:
          "APPA-INVOICE-MATCHING",
        workItems,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/rpa/results",
  (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const {
        invoiceId,
        robotName =
          "UiPath Robot",
        status,
        message = "",
      } = req.body || {};

      if (
        !invoiceId ||
        !status
      ) {
        return res.status(400).json({
          success: false,
          message:
            "invoiceId and status are required.",
        });
      }

      const invoice =
        db.prepare(`
          SELECT
            i.id,
            i.invoice_number AS invoiceNumber
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            i.id = ?
            AND d.organisation_id = ?
        `).get(
          invoiceId,
          organisationId
        );

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message:
            "Invoice not found.",
        });
      }

      createAudit(
        organisationId,
        "RPA_RESULT_RECEIVED",
        "invoice",
        invoiceId,
        `${robotName}: ${status}${
          message
            ? ` - ${message}`
            : ""
        }`
      );

      res.json({
        success: true,
        received: {
          invoiceId,
          robotName,
          status,
          message,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/* =========================================================
   SYNTHETIC DATA INITIALIZER
   ========================================================= */

router.post(
  "/seed",
  (_req, res) => {
    const result =
      seedEnterpriseData(req.organisation.id);

    res.json({
      success: true,
      message:
        "Synthetic APPA enterprise data initialized.",
      supplier:
        result.supplier.name,
      purchaseOrder:
        result.po.po_number,
    });
  }
);


/* APPA SYNTHETIC WORKFLOW SCENARIOS */

/*
 * scenarioService still contains global development/test
 * data operations. Until that service is organisation-aware,
 * these routes must not invoke it.
 */

function scenarioTenantMigrationRequired(
  _req,
  res
) {
  return res.status(503).json({
    success: false,
    code:
      "SCENARIO_TENANT_MIGRATION_REQUIRED",
    message:
      "Synthetic scenario operations are temporarily unavailable while organisation isolation is being completed.",
  });
}

router.post(
  "/scenarios/run",
  scenarioTenantMigrationRequired
);

router.post(
  "/scenarios/seed",
  scenarioTenantMigrationRequired
);

router.get(
  "/scenarios",
  scenarioTenantMigrationRequired
);

router.get(
  "/scenarios/results",
  scenarioTenantMigrationRequired
);

router.delete(
  "/scenarios",
  scenarioTenantMigrationRequired
);

module.exports = router;
