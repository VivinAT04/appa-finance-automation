const express =
  require("express");

const {
  randomUUID,
} = require("crypto");

const db =
  require("./database");

const router =
  express.Router();

async function createAudit(
  organisationId,
  action,
  entityType,
  entityId,
  description
) {
  await db.execute(
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
      VALUES (
        $1, $2, $3, $4,
        $5, $6, $7
      )
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

router.get(
  "/health",
  (req, res) => {
    res.json({
      success: true,
      integration:
        "APPA UiPath RPA",
      robot:
        req.rpaRobot.name,
      organisation:
        req.organisation,
      status: "ready",
    });
  }
);

router.get(
  "/work-items",
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const workItems =
        await db.many(
          `
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
              ON d.id =
                i.document_id

            LEFT JOIN invoice_matches m
              ON m.invoice_id =
                i.id

            WHERE
              d.organisation_id = $1

              AND
                i.validation_status =
                  'Validated'

              AND (
                m.id IS NULL
                OR
                  m.match_status <>
                    'Matched'
              )

            ORDER BY
              i.created_at
          `,
          [organisationId]
        );

      res.json({
        success: true,

        /*
         * This is the APPA API work-item
         * feed. A later UiPath integration
         * will place these transactions into
         * the real Orchestrator Queue.
         */
        queue:
          "APPA-INVOICE-MATCHING",

        robot:
          req.rpaRobot.name,

        workItems,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/results",
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const {
        invoiceId,
        status,
        message = "",
      } = req.body || {};

      const robotName =
        req.rpaRobot.name;

      if (
        !invoiceId ||
        !status
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "invoiceId and status are required.",
          });
      }

      const invoice =
        await db.one(
          `
            SELECT
              i.id,
              i.invoice_number AS "invoiceNumber"

            FROM invoices i

            INNER JOIN documents d
              ON d.id =
                i.document_id

            WHERE
              i.id = $1
              AND
                d.organisation_id = $2
          `,
          [
            invoiceId,
            organisationId,
          ]
        );

      if (!invoice) {
        return res
          .status(404)
          .json({
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

      return res.json({
        success: true,
        received: {
          invoiceId,
          invoiceNumber:
            invoice.invoiceNumber,
          robotName,
          status,
          message,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
