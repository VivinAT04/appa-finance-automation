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
  action,
  entityType,
  entityId,
  description
) {
  db.prepare(`
    INSERT INTO audit_logs (
      id,
      action,
      entity_type,
      entity_id,
      description,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    action,
    entityType,
    entityId,
    description,
    new Date().toISOString()
  );
}

/* =========================================================
   SUPPLIERS
   ========================================================= */

router.get(
  "/suppliers",
  (_req, res) => {
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
      ORDER BY name
    `).all();

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
  (_req, res) => {
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

      JOIN suppliers s
        ON s.id = po.supplier_id

      ORDER BY po.created_at DESC
    `).all();

    res.json({
      success: true,
      purchaseOrders,
    });
  }
);

router.get(
  "/purchase-orders/:id",
  (req, res) => {
    const purchaseOrder = db.prepare(`
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

      JOIN suppliers s
        ON s.id = po.supplier_id

      WHERE po.id = ?
    `).get(req.params.id);

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
          id,
          description,
          quantity,
          unit_price AS unitPrice,
          line_total AS lineTotal,
          position
        FROM purchase_order_items
        WHERE purchase_order_id = ?
        ORDER BY position
      `).all(purchaseOrder.id);

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
      const match =
        matchInvoice(
          req.params.invoiceId
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
    const match =
      getMatch(
        req.params.invoiceId
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
  (_req, res, next) => {
    try {
      const openExceptions = db.prepare(`
        SELECT COUNT(*) AS count
        FROM exceptions
        WHERE status = 'Open'
      `).get().count;

      const pendingApprovals = db.prepare(`
        SELECT COUNT(*) AS count
        FROM invoices i
        LEFT JOIN invoice_matches m
          ON m.invoice_id = i.id
        WHERE
          m.match_status = 'Matched'
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
      `).get().count;

      const exceptionInvoices = db.prepare(`
        SELECT COUNT(DISTINCT invoice_id) AS count
        FROM exceptions
        WHERE status = 'Open'
      `).get().count;

      const latestAutomation = db.prepare(`
        SELECT
          id,
          process_name AS processName,
          source,
          status,
          started_at AS startedAt,
          completed_at AS completedAt
        FROM automation_runs
        ORDER BY started_at DESC
        LIMIT 1
      `).get() || null;

      res.json({
        success: true,
        summary: {
          pendingApprovals,
          openExceptions,
          exceptionInvoices,
          automationStatus:
            latestAutomation?.status || "Idle",
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
  (_req, res, next) => {
    try {
      const pending = db.prepare(`
        SELECT
          i.id AS invoiceId,
          i.invoice_number AS invoiceNumber,
          i.supplier_name AS supplierName,
          i.currency,
          i.total_amount AS totalAmount,
          i.purchase_order_number AS purchaseOrderNumber,
          i.invoice_date AS invoiceDate,
          i.due_date AS dueDate,
          i.extraction_confidence AS extractionConfidence,
          i.validation_status AS validationStatus,

          m.match_score AS matchScore,
          m.match_status AS matchStatus,
          m.variance_amount AS varianceAmount,
          m.updated_at AS matchedAt,

          (
            SELECT COUNT(*)
            FROM exceptions e
            WHERE
              e.invoice_id = i.id
              AND e.status = 'Open'
          ) AS openExceptionCount

        FROM invoices i

        JOIN invoice_matches m
          ON m.invoice_id = i.id

        WHERE
          m.match_status = 'Matched'

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
          COALESCE(i.due_date, i.created_at) ASC,
          i.created_at ASC
      `).all();

      res.json({
        success: true,
        total: pending.length,
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
  (_req, res) => {
    const approvals = db.prepare(`
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

      JOIN invoices i
        ON i.id = a.invoice_id

      ORDER BY a.created_at DESC
    `).all();

    res.json({
      success: true,
      approvals,
    });
  }
);

router.post(
  "/approvals/:invoiceId",
  (req, res) => {
    const {
      decision,
      comments = "",
      approver = "Administrator",
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

    const invoice = db.prepare(`
      SELECT *
      FROM invoices
      WHERE id = ?
    `).get(
      req.params.invoiceId
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
        FROM exceptions
        WHERE
          invoice_id = ?
          AND status = 'Open'
      `).get(
        req.params.invoiceId
      ).count;

    if (
      decision === "Approved" &&
      openExceptionCount > 0
    ) {
      return res.status(409).json({
        success: false,
        code: "OPEN_EXCEPTIONS",
        message:
          `Invoice cannot be approved while ${openExceptionCount} unresolved exception${openExceptionCount === 1 ? "" : "s"} remain.`,
        openExceptionCount,
      });
    }

    const currentMatch =
      getMatch(
        req.params.invoiceId
      );

    if (
      decision === "Approved" &&
      (
        !currentMatch ||
        currentMatch.matchStatus !== "Matched"
      )
    ) {
      return res.status(409).json({
        success: false,
        code: "MATCH_REQUIRED",
        message:
          "Invoice must have a successful PO match before manual approval.",
      });
    }


    const id =
      randomUUID();

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
      id,
      invoice.id,
      decision,
      "Manual",
      approver,
      comments,
      new Date().toISOString()
    );

    createAudit(
      decision === "Approved"
        ? "INVOICE_MANUALLY_APPROVED"
        : "INVOICE_REJECTED",
      "invoice",
      invoice.id,
      `${invoice.invoice_number} ${decision.toLowerCase()} by ${approver}`
    );

    res.status(201).json({
      success: true,
      approvalId: id,
      decision,
    });
  }
);

/* =========================================================
   EXCEPTIONS
   ========================================================= */

router.get(
  "/exceptions",
  (_req, res) => {
    const exceptions = db.prepare(`
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

      JOIN invoices i
        ON i.id = e.invoice_id

      ORDER BY
        CASE e.status
          WHEN 'Open' THEN 0
          ELSE 1
        END,
        e.created_at DESC
    `).all();

    res.json({
      success: true,
      exceptions,
    });
  }
);

router.post(
  "/exceptions/:id/resolve",
  (req, res) => {
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
        SELECT *
        FROM exceptions
        WHERE id = ?
      `).get(req.params.id);

    if (!exception) {
      return res.status(404).json({
        success: false,
        message:
          "Exception not found.",
      });
    }

    const now =
      new Date().toISOString();

    db.prepare(`
      UPDATE exceptions
      SET
        status = 'Resolved',
        resolution = ?,
        resolved_at = ?
      WHERE id = ?
    `).run(
      resolution,
      now,
      exception.id
    );

    createAudit(
      "EXCEPTION_RESOLVED",
      "exception",
      exception.id,
      resolution
    );

    res.json({
      success: true,
      exceptionId:
        exception.id,
      status: "Resolved",
    });
  }
);

/* =========================================================
   AUTOMATION RUNS
   ========================================================= */

router.get(
  "/automation-runs",
  (_req, res) => {
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
      ORDER BY started_at DESC
      LIMIT 100
    `).all();

    res.json({
      success: true,
      runs,
    });
  }
);

router.post(
  "/automation/run-ap-cycle",
  (req, res, next) => {
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
        details
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      "Accounts Payable Matching Cycle",
      source,
      "Running",
      startedAt,
      "Processing validated invoices through the APPA PO matching engine."
    );

    try {
      const invoices =
        db.prepare(`
          SELECT id
          FROM invoices
          WHERE validation_status =
            'Validated'
        `).all();

      let succeeded = 0;
      let failed = 0;

      for (
        const invoice
        of invoices
      ) {
        try {
          matchInvoice(
            invoice.id
          );

          succeeded += 1;
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

      db.prepare(`
        UPDATE automation_runs
        SET
          status = ?,
          items_processed = ?,
          items_succeeded = ?,
          items_failed = ?,
          completed_at = ?,
          details = ?
        WHERE id = ?
      `).run(
        status,
        invoices.length,
        succeeded,
        failed,
        completedAt,
        `Processed ${invoices.length} validated invoice(s).`,
        runId
      );

      createAudit(
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
          WHERE id = ?
        `).get(runId);

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
        WHERE id = ?
      `).run(
        new Date().toISOString(),
        error.message,
        runId
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
  (_req, res, next) => {
    try {
      function scalar(sql, params = []) {
        const row = db.prepare(sql).get(...params);
        return Number(row?.value || 0);
      }

      const dashboard = {
        documents: scalar(`
          SELECT COUNT(*) AS value
          FROM documents
        `),

        invoices: scalar(`
          SELECT COUNT(*) AS value
          FROM invoices
        `),

        invoiceValue: scalar(`
          SELECT
            COALESCE(
              SUM(total_amount),
              0
            ) AS value
          FROM invoices
        `),

        suppliers: scalar(`
          SELECT COUNT(*) AS value
          FROM suppliers
        `),

        purchaseOrders: scalar(`
          SELECT COUNT(*) AS value
          FROM purchase_orders
        `),

        matchedInvoices: scalar(`
          SELECT COUNT(*) AS value
          FROM invoice_matches
          WHERE match_status = 'Matched'
        `),

        openExceptions: scalar(`
          SELECT COUNT(*) AS value
          FROM exceptions
          WHERE status = 'Open'
        `),

        approvals: scalar(`
          SELECT COUNT(*) AS value
          FROM approvals
          WHERE decision = 'Approved'
        `),

        automationRuns: scalar(`
          SELECT COUNT(*) AS value
          FROM automation_runs
        `),
      };

      const pendingApprovals = scalar(`
        SELECT COUNT(*) AS value
        FROM invoices i
        WHERE NOT EXISTS (
          SELECT 1
          FROM approvals a
          WHERE a.invoice_id = i.id
            AND a.decision = 'Approved'
        )
      `);

      const pendingApprovalValue = scalar(`
        SELECT
          COALESCE(
            SUM(i.total_amount),
            0
          ) AS value
        FROM invoices i
        WHERE NOT EXISTS (
          SELECT 1
          FROM approvals a
          WHERE a.invoice_id = i.id
            AND a.decision = 'Approved'
        )
      `);

      const automationTotals = db.prepare(`
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
      `).get();

      const processedItems =
        Number(automationTotals?.processed || 0);

      const succeededItems =
        Number(automationTotals?.succeeded || 0);

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

      const recentTransactions = db.prepare(`
        SELECT
          i.id,
          i.invoice_number AS invoice,
          i.supplier_name AS supplier,
          i.currency,
          COALESCE(
            i.total_amount,
            0
          ) AS amount,
          i.validation_status AS validationStatus,
          i.updated_at AS updatedAt,

          im.match_status AS matchStatus,

          (
            SELECT a.decision
            FROM approvals a
            WHERE a.invoice_id = i.id
            ORDER BY a.created_at DESC
            LIMIT 1
          ) AS approvalDecision,

          (
            SELECT COUNT(*)
            FROM exceptions e
            WHERE e.invoice_id = i.id
              AND e.status = 'Open'
          ) AS openExceptionCount

        FROM invoices i

        LEFT JOIN invoice_matches im
          ON im.invoice_id = i.id

        ORDER BY
          datetime(i.updated_at) DESC,
          i.updated_at DESC

        LIMIT 5
      `).all().map((row) => {
        let status = "Processing";

        if (Number(row.openExceptionCount) > 0) {
          status = "Exception";
        } else if (
          row.approvalDecision === "Approved"
        ) {
          status = "Completed";
        } else if (
          row.matchStatus === "Matched"
        ) {
          status = "Approval";
        } else if (
          row.validationStatus === "Validated"
        ) {
          status = "Processing";
        }

        return {
          ...row,
          status,
        };
      });

      const recentAutomationRuns = db.prepare(`
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
        ORDER BY
          datetime(started_at) DESC,
          started_at DESC
        LIMIT 3
      `).all();

      const dailyVolume = db.prepare(`
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

        LEFT JOIN invoices i
          ON date(i.created_at) = days.day

        GROUP BY days.day
        ORDER BY days.day
      `).all();

      const mismatchCount = scalar(`
        SELECT COUNT(*) AS value
        FROM exceptions
        WHERE status = 'Open'
          AND (
            UPPER(exception_type)
              LIKE '%MISMATCH%'

            OR UPPER(exception_type)
              LIKE '%AMOUNT%'

            OR UPPER(exception_type)
              LIKE '%LINE%'
          )
      `);

      const lowConfidenceDocuments = scalar(`
        SELECT COUNT(*) AS value
        FROM invoices
        WHERE
          COALESCE(
            extraction_confidence,
            0
          ) < 80
      `);

      const overdueApprovals = scalar(`
        SELECT COUNT(*) AS value
        FROM invoices i
        WHERE datetime(i.created_at)
          <= datetime('now', '-24 hours')

          AND NOT EXISTS (
            SELECT 1
            FROM approvals a
            WHERE a.invoice_id = i.id
              AND a.decision = 'Approved'
          )
      `);

      const openHighSeverityExceptions = scalar(`
        SELECT COUNT(*) AS value
        FROM exceptions
        WHERE status = 'Open'
          AND UPPER(severity) = 'HIGH'
      `);

      res.json({
        success: true,

        dashboard: {
          ...dashboard,

          pendingApprovals,
          pendingApprovalValue,

          automation: {
            processed: processedItems,
            succeeded: succeededItems,
            failed:
              Number(
                automationTotals?.failed || 0
              ),
            successRate:
              automationSuccessRate,
          },

          recentTransactions,
          recentAutomationRuns,
          dailyVolume,

          attention: {
            mismatches: mismatchCount,
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
  (_req, res) => {
    const invoiceSummary =
      db.prepare(`
        SELECT
          currency,
          COUNT(*) AS invoiceCount,
          COALESCE(
            SUM(total_amount),
            0
          ) AS totalValue,
          COALESCE(
            AVG(
              extraction_confidence
            ),
            0
          ) AS averageConfidence
        FROM invoices
        GROUP BY currency
      `).all();

    const matchSummary =
      db.prepare(`
        SELECT
          match_status AS matchStatus,
          COUNT(*) AS count,
          COALESCE(
            AVG(match_score),
            0
          ) AS averageScore
        FROM invoice_matches
        GROUP BY match_status
      `).all();

    const exceptionSummary =
      db.prepare(`
        SELECT
          exception_type AS exceptionType,
          status,
          COUNT(*) AS count
        FROM exceptions
        GROUP BY
          exception_type,
          status
        ORDER BY count DESC
      `).all();

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
        GROUP BY status
      `).all();

    res.json({
      success: true,
      invoiceSummary,
      matchSummary,
      exceptionSummary,
      automationSummary,
    });
  }
);

/* =========================================================
   SETTINGS
   ========================================================= */

router.get(
  "/settings",
  (_req, res) => {
    const settings =
      db.prepare(`
        SELECT
          setting_key AS key,
          setting_value AS value,
          description,
          updated_at AS updatedAt
        FROM app_settings
        ORDER BY setting_key
      `).all();

    res.json({
      success: true,
      settings,
    });
  }
);

router.put(
  "/settings/:key",
  (req, res) => {
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
        WHERE setting_key = ?
      `).get(req.params.key);

    if (!setting) {
      return res.status(404).json({
        success: false,
        message:
          "Setting not found.",
      });
    }

    db.prepare(`
      UPDATE app_settings
      SET
        setting_value = ?,
        updated_at = ?
      WHERE setting_key = ?
    `).run(
      value,
      new Date().toISOString(),
      req.params.key
    );

    createAudit(
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
  }
);

/* =========================================================
   RPA / UIPATH INTEGRATION CONTRACT

   These endpoints are integration points.
   They do NOT claim that UiPath is currently executing.
   ========================================================= */

router.get(
  "/rpa/work-items",
  (_req, res) => {
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

        LEFT JOIN invoice_matches m
          ON m.invoice_id = i.id

        WHERE
          i.validation_status =
            'Validated'
          AND (
            m.id IS NULL
            OR m.match_status <>
              'Matched'
          )

        ORDER BY i.created_at
      `).all();

    res.json({
      success: true,
      queue:
        "APPA-INVOICE-MATCHING",
      workItems,
    });
  }
);

router.post(
  "/rpa/results",
  (req, res) => {
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
        SELECT id
        FROM invoices
        WHERE id = ?
      `).get(invoiceId);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message:
          "Invoice not found.",
      });
    }

    createAudit(
      "RPA_RESULT_RECEIVED",
      "invoice",
      invoiceId,
      `${robotName}: ${status}${
        message
          ? ` — ${message}`
          : ""
      }`
    );

    res.json({
      success: true,
      received: true,
    });
  }
);

/* =========================================================
   SYNTHETIC DATA INITIALIZER
   ========================================================= */

router.post(
  "/seed",
  (_req, res) => {
    const result =
      seedEnterpriseData();

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

router.post(
  "/scenarios/run",
  async (_req, res, next) => {
    try {
      const result =
        await runScenarios();

      res.json({
        success:
          result.summary.allPassed,
        message:
          result.summary.allPassed
            ? "All synthetic AP workflow scenarios passed."
            : "One or more synthetic AP workflow scenarios failed.",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/scenarios/seed",
  (_req, res, next) => {
    try {
      const result = seedScenarios();

      res.status(201).json({
        success: true,
        message:
          "Synthetic AP workflow scenarios prepared.",
        result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/scenarios",
  (_req, res, next) => {
    try {
      res.json({
        success: true,
        scenarios:
          getScenarioInvoices(),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/scenarios/results",
  (_req, res, next) => {
    try {
      const results =
        getScenarioResults();

      res.json({
        success: true,
        total: results.length,
        passed:
          results.filter(
            (item) => item.passed
          ).length,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/scenarios",
  (_req, res, next) => {
    try {
      const result =
        removeScenarioData();

      res.json({
        success: true,
        message:
          "Synthetic scenario data removed.",
        result,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
