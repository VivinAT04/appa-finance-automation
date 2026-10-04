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

async function createAudit(
  organisationId,
  action,
  entityType,
  entityId,
  description,
  client = db
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required for enterprise audit events."
    );
  }

  await client.execute(
    `
      INSERT INTO audit_logs (
        id,
        action,
        entity_type,
        entity_id,
        description,
        created_at,
        organisation_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      randomUUID(),
      action,
      entityType,
      entityId,
      description,
      new Date().toISOString(),
      organisationId,
    ]
  );
}

/* =========================================================
   SUPPLIERS
   ========================================================= */

router.get(
  "/suppliers",
  async (req, res) => {
    const organisationId =
      req.organisation.id;

    const suppliers = await db.many(`
      SELECT
        id,
        supplier_code AS "supplierCode",
        name,
        email,
        tax_id AS "taxId",
        payment_terms_days AS "paymentTermsDays",
        status,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM suppliers
      WHERE organisation_id = $1
      ORDER BY name
    `, [organisationId]);

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
  async (req, res) => {
    const organisationId =
      req.organisation.id;

    const purchaseOrders = await db.many(`
      SELECT
        po.id,
        po.po_number AS "poNumber",
        po.supplier_id AS "supplierId",
        s.name AS "supplierName",
        s.supplier_code AS "supplierCode",
        po.order_date AS "orderDate",
        po.currency,
        po.subtotal,
        po.tax_amount AS "taxAmount",
        po.total_amount AS "totalAmount",
        po.status,
        po.created_at AS "createdAt",
        po.updated_at AS "updatedAt"
      FROM purchase_orders po

      INNER JOIN suppliers s
        ON s.id = po.supplier_id
        AND s.organisation_id =
            po.organisation_id

      WHERE
        po.organisation_id = $1

      ORDER BY
        po.created_at DESC
    `, [organisationId]);

    res.json({
      success: true,
      purchaseOrders,
    });
  }
);


router.post(
  "/purchase-orders",
  async (req, res, next) => {
    try {
      const organisationId = req.organisation.id;

      const {
        poNumber,
        supplierId,
        orderDate,
        currency = "GBP",
        taxRate = 18,
        lineItems = [],
      } = req.body || {};

      if (!poNumber || !supplierId) {
        return res.status(400).json({
          success: false,
          message:
            "Purchase order number and supplier are required.",
        });
      }

      if (!Array.isArray(lineItems) || !lineItems.length) {
        return res.status(400).json({
          success: false,
          message:
            "At least one purchase-order line item is required.",
        });
      }

      const supplier = await db.one(
        `
          SELECT id, name
          FROM suppliers
          WHERE id = $1
            AND organisation_id = $2
        `,
        [supplierId, organisationId]
      );

      if (!supplier) {
        return res.status(404).json({
          success: false,
          message: "Supplier not found.",
        });
      }

      const duplicate = await db.one(
        `
          SELECT id
          FROM purchase_orders
          WHERE LOWER(po_number) = LOWER($1)
            AND organisation_id = $2
        `,
        [String(poNumber).trim(), organisationId]
      );

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message:
            "A purchase order with this number already exists.",
        });
      }

      const normalisedItems = lineItems
        .map((item) => {
          const quantity = Number(item.quantity || 0);
          const unitPrice = Number(item.unitPrice || 0);

          return {
            description:
              String(item.description || "").trim(),
            quantity,
            unitPrice,
            lineTotal: Number(
              (quantity * unitPrice).toFixed(2)
            ),
          };
        })
        .filter(
          (item) =>
            item.description &&
            item.quantity > 0
        );

      if (!normalisedItems.length) {
        return res.status(400).json({
          success: false,
          message:
            "Enter a description and quantity for at least one item.",
        });
      }

      const subtotal = Number(
        normalisedItems
          .reduce(
            (sum, item) =>
              sum + item.lineTotal,
            0
          )
          .toFixed(2)
      );

      const taxAmount = Number(
        (
          subtotal *
          (Number(taxRate || 0) / 100)
        ).toFixed(2)
      );

      const totalAmount = Number(
        (subtotal + taxAmount).toFixed(2)
      );

      const id = randomUUID();
      const now = new Date().toISOString();

      await db.transaction(async (tx) => {
        await tx.execute(
          `
            INSERT INTO purchase_orders (
              id,
              po_number,
              supplier_id,
              order_date,
              currency,
              subtotal,
              tax_amount,
              total_amount,
              status,
              created_at,
              updated_at,
              organisation_id
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              $7, $8, $9, $10, $11, $12
            )
          `,
          [
            id,
            String(poNumber).trim(),
            supplierId,
            orderDate ||
              new Date()
                .toISOString()
                .slice(0, 10),
            currency || "GBP",
            subtotal,
            taxAmount,
            totalAmount,
            "Open",
            now,
            now,
            organisationId,
          ]
        );

        for (const item of normalisedItems) {
          await tx.execute(
            `
              INSERT INTO purchase_order_items (
                id,
                purchase_order_id,
                description,
                quantity,
                unit_price,
                line_total,
                created_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              randomUUID(),
              id,
              item.description,
              item.quantity,
              item.unitPrice,
              item.lineTotal,
              now,
            ]
          );
        }

        await createAudit(
          organisationId,
          "PURCHASE_ORDER_CREATED",
          "purchase_order",
          id,
          `${poNumber} created for ${supplier.name}`,
          tx
        );
      });

      const purchaseOrder = await db.one(
        `
          SELECT
            po.id,
            po.po_number AS "poNumber",
            po.supplier_id AS "supplierId",
            s.name AS "supplierName",
            s.supplier_code AS "supplierCode",
            po.order_date AS "orderDate",
            po.currency,
            po.subtotal,
            po.tax_amount AS "taxAmount",
            po.total_amount AS "totalAmount",
            po.status,
            po.created_at AS "createdAt",
            po.updated_at AS "updatedAt"
          FROM purchase_orders po
          INNER JOIN suppliers s
            ON s.id = po.supplier_id
           AND s.organisation_id =
               po.organisation_id
          WHERE po.id = $1
            AND po.organisation_id = $2
        `,
        [id, organisationId]
      );

      purchaseOrder.lineItems =
        normalisedItems;

      return res.status(201).json({
        success: true,
        purchaseOrder,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/purchase-orders/:id",
  async (req, res) => {
    const organisationId =
      req.organisation.id;

    const purchaseOrder =
      await db.one(`
        SELECT
          po.id,
          po.po_number AS "poNumber",
          po.supplier_id AS "supplierId",
          s.name AS "supplierName",
          s.supplier_code AS "supplierCode",
          s.email AS "supplierEmail",
          po.order_date AS "orderDate",
          po.currency,
          po.subtotal,
          po.tax_amount AS "taxAmount",
          po.total_amount AS "totalAmount",
          po.status,
          po.created_at AS "createdAt",
          po.updated_at AS "updatedAt"
        FROM purchase_orders po

        INNER JOIN suppliers s
          ON s.id = po.supplier_id
          AND s.organisation_id =
              po.organisation_id

        WHERE
          po.id = $1
          AND po.organisation_id = $2
      `, [req.params.id,
        organisationId]);

    if (!purchaseOrder) {
      return res.status(404).json({
        success: false,
        message:
          "Purchase order not found.",
      });
    }

    purchaseOrder.lineItems =
      await db.many(`
        SELECT
          poi.id,
          poi.description,
          poi.quantity,
          poi.unit_price AS "unitPrice",
          poi.line_total AS "lineTotal",
          poi.position
        FROM purchase_order_items poi

        INNER JOIN purchase_orders po
          ON po.id =
             poi.purchase_order_id

        WHERE
          poi.purchase_order_id = $1
          AND po.organisation_id = $2

        ORDER BY poi.position
      `, [purchaseOrder.id,
        organisationId]);

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
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const match =
        await matchInvoice(
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
  async (req, res) => {
    const organisationId =
      req.organisation.id;

    const match =
      await getMatch(
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
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const openExceptions =
        (await db.one(`
          SELECT COUNT(*) AS count
          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            e.status = 'Open'
            AND d.organisation_id = $1
        `, [organisationId])).count;

      const pendingApprovals =
        (await db.one(`
          SELECT COUNT(*) AS count
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          INNER JOIN invoice_matches m
            ON m.invoice_id = i.id

          WHERE
            d.organisation_id = $1
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
        `, [organisationId])).count;

      const exceptionInvoices =
        (await db.one(`
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
            AND d.organisation_id = $1
        `, [organisationId])).count;

      const latestAutomation =
        await db.one(`
          SELECT
            id,
            process_name AS "processName",
            source,
            status,
            started_at AS "startedAt",
            completed_at AS "completedAt"
          FROM automation_runs
          WHERE organisation_id = $1
          ORDER BY started_at DESC
          LIMIT 1
        `, [organisationId]) || null;

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
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const pending =
        await db.many(`
          SELECT
            i.id AS "invoiceId",
            i.invoice_number AS "invoiceNumber",
            i.supplier_name AS "supplierName",
            i.currency,
            i.total_amount AS "totalAmount",
            i.purchase_order_number
              AS "purchaseOrderNumber",
            i.invoice_date AS "invoiceDate",
            i.due_date AS "dueDate",
            i.extraction_confidence
              AS "extractionConfidence",
            i.validation_status
              AS "validationStatus",

            m.match_score AS "matchScore",
            m.match_status AS "matchStatus",
            m.variance_amount
              AS "varianceAmount",
            m.updated_at AS "matchedAt",

            (
              SELECT COUNT(*)
              FROM exceptions e
              WHERE
                e.invoice_id = i.id
                AND e.status = 'Open'
            ) AS "openExceptionCount"

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          INNER JOIN invoice_matches m
            ON m.invoice_id = i.id

          WHERE
            d.organisation_id = $1
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
        `, [organisationId]);

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
  async (req, res) => {
    const organisationId =
      req.organisation.id;

    const approvals =
      await db.many(`
        SELECT
          a.id,
          a.invoice_id AS "invoiceId",

          i.invoice_number AS "invoiceNumber",
          i.supplier_name AS "supplierName",
          i.currency,
          i.total_amount AS "totalAmount",

          a.decision,
          a.approval_type AS "approvalType",
          a.approver,
          a.comments,
          a.created_at AS "createdAt"

        FROM approvals a

        INNER JOIN invoices i
          ON i.id = a.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          d.organisation_id = $1

        ORDER BY
          a.created_at DESC
      `, [organisationId]);

    res.json({
      success: true,
      approvals,
    });
  }
);

router.post(
  "/approvals/:invoiceId",
  async (req, res) => {
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
      await db.one(`
        SELECT i.*
        FROM invoices i

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          i.id = $1
          AND d.organisation_id = $2
      `, [req.params.invoiceId,
        organisationId]);

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message:
          "Invoice not found.",
      });
    }

    const openExceptionCount =
      await db.one(`
        SELECT COUNT(*) AS count
        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          e.invoice_id = $1
          AND e.status = 'Open'
          AND d.organisation_id = $2
      `, [invoice.id,
        organisationId]).count;

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

    await db.execute(`
      INSERT INTO approvals (
        id,
        invoice_id,
        decision,
        approval_type,
        approver,
        comments,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [approvalId,
      invoice.id,
      decision,
      "Manual",
      String(approver).trim() ||
        "Authenticated User",
      String(comments || "").trim(),
      createdAt
    ]);

    await createAudit(
      organisationId,
      "INVOICE_APPROVAL_RECORDED",
      "approval",
      approvalId,
      `${invoice.invoice_number}: ${decision}`
    );

    const approval =
      await db.one(`
        SELECT
          a.id,
          a.invoice_id AS "invoiceId",
          a.decision,
          a.approval_type AS "approvalType",
          a.approver,
          a.comments,
          a.created_at AS "createdAt"
        FROM approvals a

        INNER JOIN invoices i
          ON i.id = a.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          a.id = $1
          AND d.organisation_id = $2
      `, [approvalId,
        organisationId]);

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
  async (req, res) => {
    const organisationId =
      req.organisation.id;

    const exceptions =
      await db.many(`
        SELECT
          e.id,
          e.invoice_id AS "invoiceId",

          i.invoice_number AS "invoiceNumber",
          i.supplier_name AS "supplierName",
          i.currency,
          i.total_amount AS "totalAmount",

          e.exception_type AS "exceptionType",
          e.severity,
          e.description,
          e.status,
          e.resolution,
          e.created_at AS "createdAt",
          e.resolved_at AS "resolvedAt"

        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          d.organisation_id = $1

        ORDER BY
          CASE e.status
            WHEN 'Open' THEN 0
            ELSE 1
          END,
          e.created_at DESC
      `, [organisationId]);

    res.json({
      success: true,
      exceptions,
    });
  }
);

router.post(
  "/exceptions/:id/resolve",
  async (req, res) => {
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
      await db.one(`
        SELECT
          e.*,
          i.invoice_number AS "invoiceNumber"
        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          e.id = $1
          AND d.organisation_id = $2
      `, [req.params.id,
        organisationId]);

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
      await db.execute(`
        UPDATE exceptions
        SET
          status = 'Resolved',
          resolution = $1,
          resolved_at = $2
        WHERE
          id = $3
          AND invoice_id IN (
            SELECT i.id
            FROM invoices i

            INNER JOIN documents d
              ON d.id = i.document_id

            WHERE
              d.organisation_id = $4
          )
      `, [resolution,
        now,
        exception.id,
        organisationId]);

    if (update.rowCount !== 1) {
      return res.status(404).json({
        success: false,
        message:
          "Exception not found.",
      });
    }

    await createAudit(
      organisationId,
      "EXCEPTION_RESOLVED",
      "exception",
      exception.id,
      `${exception.invoiceNumber}: ${resolution}`
    );

    const resolved =
      await db.one(`
        SELECT
          e.id,
          e.invoice_id AS "invoiceId",
          e.exception_type AS "exceptionType",
          e.severity,
          e.description,
          e.status,
          e.resolution,
          e.created_at AS "createdAt",
          e.resolved_at AS "resolvedAt"
        FROM exceptions e

        INNER JOIN invoices i
          ON i.id = e.invoice_id

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          e.id = $1
          AND d.organisation_id = $2
      `, [exception.id,
        organisationId]);

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
  async (req, res) => {
    const organisationId =
      req.organisation.id;

    const runs = await db.many(`
      SELECT
        id,
        process_name AS "processName",
        source,
        status,
        items_processed AS "itemsProcessed",
        items_succeeded AS "itemsSucceeded",
        items_failed AS "itemsFailed",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        details
      FROM automation_runs
      WHERE organisation_id = $1
      ORDER BY started_at DESC
      LIMIT 100
    `, [organisationId]);

    res.json({
      success: true,
      runs,
    });
  }
);

router.post(
  "/automation/run-ap-cycle",
  async (req, res, next) => {
    const organisationId =
      req.organisation.id;

    const runId =
      randomUUID();

    const startedAt =
      new Date().toISOString();

    const source =
      req.body?.source ||
      "APPA Engine";

    await db.execute(`
      INSERT INTO automation_runs (
        id,
        process_name,
        source,
        status,
        started_at,
        details,
        organisation_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [runId,
      "Accounts Payable Matching Cycle",
      source,
      "Running",
      startedAt,
      "Processing validated invoices through the APPA PO matching engine.",
      organisationId]);

    try {
      const invoices =
        await db.many(`
          SELECT i.id
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            i.validation_status =
              'Validated'
            AND d.organisation_id = $1
        `, [organisationId]);

      let succeeded = 0;
      let failed = 0;

      for (
        const invoice
        of invoices
      ) {
        try {
          const matchResult =
            await matchInvoice(
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
        await db.execute(`
          UPDATE automation_runs
          SET
            status = $1,
            items_processed = $2,
            items_succeeded = $3,
            items_failed = $4,
            completed_at = $5,
            details = $6
          WHERE
            id = $7
            AND organisation_id = $8
        `, [status,
          invoices.length,
          succeeded,
          failed,
          completedAt,
          `Processed ${invoices.length} validated invoice(s).`,
          runId,
          organisationId
        ]);

      if (update.rowCount !== 1) {
        throw new Error(
          "Automation run ownership validation failed."
        );
      }

      await createAudit(
        organisationId,
        "AUTOMATION_RUN_COMPLETED",
        "automation_run",
        runId,
        `AP cycle processed ${invoices.length} invoice(s): ${succeeded} succeeded, ${failed} failed`
      );

      const run =
        await db.one(`
          SELECT
            id,
            process_name AS "processName",
            source,
            status,
            items_processed AS "itemsProcessed",
            items_succeeded AS "itemsSucceeded",
            items_failed AS "itemsFailed",
            started_at AS "startedAt",
            completed_at AS "completedAt",
            details
          FROM automation_runs
          WHERE
            id = $1
            AND organisation_id = $2
        `, [runId,
          organisationId]);

      res.json({
        success: true,
        run,
      });
    } catch (error) {
      await db.execute(`
        UPDATE automation_runs
        SET
          status = 'Failed',
          completed_at = $1,
          details = $2
        WHERE
          id = $3
          AND organisation_id = $4
      `, [
        new Date().toISOString(),
        error.message,
        runId,
        organisationId,
      ]);

      next(error);
    }
  }
);

/* =========================================================
   DASHBOARD
   ========================================================= */

router.get(
  "/dashboard",
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      async function scalar(
        sql,
        params = [organisationId]
      ) {
        const row =
          await db.one(
            sql,
            params
          );

        return Number(
          row?.value || 0
        );
      }

      const dashboard = {
        documents: await scalar(`
          SELECT COUNT(*) AS value
          FROM documents
          WHERE organisation_id = $1
        `),

        invoices: await scalar(`
          SELECT COUNT(*) AS value
          FROM invoices i
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE d.organisation_id = $1
        `),

        invoiceValue: await scalar(`
          SELECT
            COALESCE(
              SUM(i.total_amount),
              0
            ) AS value
          FROM invoices i
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE d.organisation_id = $1
        `),

        suppliers: await scalar(`
          SELECT COUNT(*) AS value
          FROM suppliers
          WHERE organisation_id = $1
        `),

        purchaseOrders: await scalar(`
          SELECT COUNT(*) AS value
          FROM purchase_orders
          WHERE organisation_id = $1
        `),

        matchedInvoices: await scalar(`
          SELECT COUNT(*) AS value
          FROM invoice_matches im
          INNER JOIN invoices i
            ON i.id = im.invoice_id
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE
            im.match_status = 'Matched'
            AND d.organisation_id = $1
        `),

        openExceptions: await scalar(`
          SELECT COUNT(*) AS value
          FROM exceptions e
          INNER JOIN invoices i
            ON i.id = e.invoice_id
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE
            e.status = 'Open'
            AND d.organisation_id = $1
        `),

        approvals: await scalar(`
          SELECT COUNT(*) AS value
          FROM approvals a
          INNER JOIN invoices i
            ON i.id = a.invoice_id
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE
            a.decision = 'Approved'
            AND d.organisation_id = $1
        `),

        automationRuns: await scalar(`
          SELECT COUNT(*) AS value
          FROM automation_runs
          WHERE organisation_id = $1
        `),
      };

      const pendingApprovals =
        await scalar(`
          SELECT COUNT(*) AS value
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = $1

            AND NOT EXISTS (
              SELECT 1
              FROM approvals a
              WHERE
                a.invoice_id = i.id
                AND a.decision = 'Approved'
            )
        `);

      const pendingApprovalValue =
        await scalar(`
          SELECT
            COALESCE(
              SUM(i.total_amount),
              0
            ) AS value

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = $1

            AND NOT EXISTS (
              SELECT 1
              FROM approvals a
              WHERE
                a.invoice_id = i.id
                AND a.decision = 'Approved'
            )
        `);

      const automationTotals =
        await db.one(`
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
          WHERE organisation_id = $1
        `, [organisationId]);

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
        (await db.many(`
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
              AS "validationStatus",

            i.updated_at AS "updatedAt",

            im.match_status
              AS "matchStatus",

            (
              SELECT a.decision
              FROM approvals a
              WHERE
                a.invoice_id = i.id
              ORDER BY
                a.created_at DESC
              LIMIT 1
            ) AS "approvalDecision",

            (
              SELECT COUNT(*)
              FROM exceptions e
              WHERE
                e.invoice_id = i.id
                AND e.status = 'Open'
            ) AS "openExceptionCount"

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          LEFT JOIN invoice_matches im
            ON im.invoice_id = i.id

          WHERE
            d.organisation_id = $1

          ORDER BY
            i.updated_at DESC

          LIMIT 5
        `, [organisationId])).map((row) => {
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
        await db.many(`
          SELECT
            id,
            process_name AS title,
            source AS subtitle,
            status,
            items_processed AS "itemsProcessed",
            items_succeeded AS "itemsSucceeded",
            items_failed AS "itemsFailed",
            started_at AS "startedAt",
            completed_at AS "completedAt"

          FROM automation_runs

          WHERE
            organisation_id = $1

          ORDER BY
            started_at DESC

          LIMIT 3
        `, [organisationId]);

      const dailyVolume =
        await db.many(`
          WITH days(day) AS (
            SELECT
              generate_series(
                CURRENT_DATE - INTERVAL '6 days',
                CURRENT_DATE,
                INTERVAL '1 day'
              )::date
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
              d.organisation_id = $1
          ) i
            ON i.created_at::date =
               days.day

          GROUP BY days.day
          ORDER BY days.day
        `, [organisationId]);

      const mismatchCount =
        await scalar(`
          SELECT COUNT(*) AS value

          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            e.status = 'Open'
            AND d.organisation_id = $1

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
        await scalar(`
          SELECT COUNT(*) AS value

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = $1

            AND COALESCE(
              i.extraction_confidence,
              0
            ) < 80
        `);

      const overdueApprovals =
        await scalar(`
          SELECT COUNT(*) AS value

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = $1

            AND i.created_at <=
              CURRENT_TIMESTAMP -
              INTERVAL '24 hours'

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
        await scalar(`
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
            AND d.organisation_id = $1
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
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const invoiceSummary =
        await db.many(`
          SELECT
            i.currency,

            COUNT(*) AS "invoiceCount",

            COALESCE(
              SUM(i.total_amount),
              0
            ) AS "totalValue",

            COALESCE(
              AVG(
                i.extraction_confidence
              ),
              0
            ) AS "averageConfidence"

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = $1

          GROUP BY
            i.currency
        `, [organisationId]);

      const matchSummary =
        await db.many(`
          SELECT
            im.match_status
              AS "matchStatus",

            COUNT(*) AS count,

            COALESCE(
              AVG(im.match_score),
              0
            ) AS "averageScore"

          FROM invoice_matches im

          INNER JOIN invoices i
            ON i.id = im.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = $1

          GROUP BY
            im.match_status
        `, [organisationId]);

      const exceptionSummary =
        await db.many(`
          SELECT
            e.exception_type
              AS "exceptionType",

            e.status,

            COUNT(*) AS count

          FROM exceptions e

          INNER JOIN invoices i
            ON i.id = e.invoice_id

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            d.organisation_id = $1

          GROUP BY
            e.exception_type,
            e.status

          ORDER BY
            count DESC
        `, [organisationId]);

      const automationSummary =
        await db.many(`
          SELECT
            status,

            COUNT(*) AS "runCount",

            COALESCE(
              SUM(items_processed),
              0
            ) AS "itemsProcessed",

            COALESCE(
              SUM(items_succeeded),
              0
            ) AS "itemsSucceeded",

            COALESCE(
              SUM(items_failed),
              0
            ) AS "itemsFailed"

          FROM automation_runs

          WHERE
            organisation_id = $1

          GROUP BY
            status
        `, [organisationId]);

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

async function ensureWorkflowSettings(
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required for workflow settings."
    );
  }

  const now =
    new Date().toISOString();

  await db.transaction(
    async (tx) => {
      for (
        const setting
        of DEFAULT_WORKFLOW_SETTINGS
      ) {
        await tx.execute(
          `
            INSERT INTO app_settings (
              setting_key,
              setting_value,
              description,
              updated_at,
              organisation_id
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (
              setting_key,
              organisation_id
            )
            DO NOTHING
          `,
          [
            setting.key,
            setting.value,
            setting.description,
            now,
            organisationId,
          ]
        );
      }
    }
  );
}

router.get(
  "/settings",
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      await ensureWorkflowSettings(
        organisationId
      );

      const settings =
        await db.many(`
          SELECT
            setting_key AS key,
            setting_value AS value,
            description,
            updated_at AS "updatedAt"
          FROM app_settings
          WHERE organisation_id = $1
          ORDER BY setting_key
        `, [organisationId]);

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
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      await ensureWorkflowSettings(
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
        await db.one(`
          SELECT *
          FROM app_settings
          WHERE
            setting_key = $1
            AND organisation_id = $2
        `, [req.params.key,
          organisationId]);

      if (!setting) {
        return res.status(404).json({
          success: false,
          message:
            "Setting not found.",
        });
      }

      const update =
        await db.execute(`
          UPDATE app_settings
          SET
            setting_value = $1,
            updated_at = $2
          WHERE
            setting_key = $3
            AND organisation_id = $4
        `, [value,
          new Date().toISOString(),
          req.params.key,
          organisationId
        ]);

      if (update.rowCount !== 1) {
        return res.status(404).json({
          success: false,
          message:
            "Setting not found.",
        });
      }

      await createAudit(
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
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const workItems =
        await db.many(`
          SELECT
            i.id AS "invoiceId",
            i.invoice_number AS "invoiceNumber",
            i.supplier_name AS "supplierName",
            i.purchase_order_number AS "purchaseOrderNumber",
            i.currency,
            i.total_amount AS "totalAmount",
            i.extraction_confidence AS "extractionConfidence",
            i.validation_status AS "validationStatus",

            COALESCE(
              m.match_status,
              'Not Processed'
            ) AS "matchStatus"

          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          LEFT JOIN invoice_matches m
            ON m.invoice_id = i.id

          WHERE
            d.organisation_id = $1

            AND i.validation_status =
              'Validated'

            AND (
              m.id IS NULL
              OR m.match_status <>
                'Matched'
            )

          ORDER BY
            i.created_at
        `, [organisationId]);

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
  async (req, res, next) => {
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
        await db.one(`
          SELECT
            i.id,
            i.invoice_number AS "invoiceNumber"
          FROM invoices i

          INNER JOIN documents d
            ON d.id = i.document_id

          WHERE
            i.id = $1
            AND d.organisation_id = $2
        `, [invoiceId,
          organisationId]);

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message:
            "Invoice not found.",
        });
      }

      await createAudit(
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
  async (req, res) => {
    const result =
      await seedEnterpriseData(req.organisation.id);

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
  async (req, res, next) => {
    try {
      const result =
        await runScenarios(
          req.organisation.id
        );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/scenarios/seed",
  async (req, res, next) => {
    try {
      const result =
        await seedScenarios(
          req.organisation.id
        );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/scenarios",
  async (req, res, next) => {
    try {
      res.json({
        success: true,

        invoices:
          await getScenarioInvoices(
            req.organisation.id
          ),
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/scenarios/results",
  async (req, res, next) => {
    try {
      const results =
        await getScenarioResults(
          req.organisation.id
        );

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/scenarios",
  async (req, res, next) => {
    try {
      const result =
        await removeScenarioData(
          req.organisation.id
        );

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
