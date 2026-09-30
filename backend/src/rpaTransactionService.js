const db = require("./database");

const QUEUE_NAME =
  "APPA-INVOICE-MATCHING";

const ALLOWED_RESULTS =
  new Set([
    "Successful",
    "BusinessException",
    "ApplicationException",
  ]);

async function getInvoiceTransaction(
  executor,
  organisationId,
  invoiceId
) {
  return executor.one(
    `
      SELECT
        i.id AS "invoiceId",
        i.invoice_number AS "invoiceNumber",
        i.supplier_name AS "supplierName",
        i.purchase_order_number AS "purchaseOrderNumber",
        i.currency,
        i.subtotal,
        i.tax_amount AS "taxAmount",
        i.total_amount AS "totalAmount",
        i.invoice_date AS "invoiceDate",
        i.due_date AS "dueDate",
        i.extraction_confidence AS "extractionConfidence",
        i.validation_status AS "validationStatus",
        d.id AS "documentId",
        d.original_name AS "documentName",
        d.status AS "documentStatus",

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
        i.id = $1
        AND d.organisation_id = $2
    `,
    [
      invoiceId,
      organisationId,
    ]
  );
}

async function getInvoiceLines(
  executor,
  invoiceId
) {
  return executor.many(
    `
      SELECT
        id,
        description,
        quantity,
        unit_price AS "unitPrice",
        line_total AS "lineTotal"

      FROM invoice_line_items

      WHERE invoice_id = $1

      ORDER BY id
    `,
    [invoiceId]
  );
}

async function buildQueueTransaction(
  organisationId,
  invoiceId
) {
  const invoice =
    await getInvoiceTransaction(
      db,
      organisationId,
      invoiceId
    );

  if (!invoice) {
    return null;
  }

  const lineItems =
    await getInvoiceLines(
      db,
      invoiceId
    );

  return {
    queueName: QUEUE_NAME,

    reference:
      invoice.invoiceNumber ||
      invoice.invoiceId,

    invoiceId:
      invoice.invoiceId,

    documentId:
      invoice.documentId,

    specificContent: {
      InvoiceId:
        invoice.invoiceId,

      InvoiceNumber:
        invoice.invoiceNumber,

      SupplierName:
        invoice.supplierName,

      PurchaseOrderNumber:
        invoice.purchaseOrderNumber,

      Currency:
        invoice.currency,

      Subtotal:
        invoice.subtotal,

      TaxAmount:
        invoice.taxAmount,

      TotalAmount:
        invoice.totalAmount,

      InvoiceDate:
        invoice.invoiceDate,

      DueDate:
        invoice.dueDate,

      ExtractionConfidence:
        invoice.extractionConfidence,

      ValidationStatus:
        invoice.validationStatus,

      MatchStatus:
        invoice.matchStatus,

      DocumentId:
        invoice.documentId,

      DocumentName:
        invoice.documentName,

      LineItems:
        lineItems,
    },
  };
}

async function listQueueCandidates(
  organisationId
) {
  const invoices =
    await db.many(
      `
        SELECT
          i.id

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
          i.created_at,
          i.id
      `,
      [organisationId]
    );

  const transactions = [];

  for (const invoice of invoices) {
    const transaction =
      await buildQueueTransaction(
        organisationId,
        invoice.id
      );

    if (transaction) {
      transactions.push(transaction);
    }
  }

  return transactions;
}

async function recordRobotResult({
  organisationId,
  robotName,
  invoiceId,
  status,
  message = "",
  queueItemKey = null,
  exceptionType = null,
}) {
  if (!ALLOWED_RESULTS.has(status)) {
    const error =
      new Error(
        "status must be Successful, BusinessException, or ApplicationException."
      );

    error.code =
      "INVALID_RPA_STATUS";

    throw error;
  }

  return db.transaction(
    async (tx) => {
      const invoice =
        await getInvoiceTransaction(
          tx,
          organisationId,
          invoiceId
        );

      if (!invoice) {
        const error =
          new Error(
            "Invoice not found."
          );

        error.code =
          "INVOICE_NOT_FOUND";

        throw error;
      }

      const description = [
        robotName,
        status,
        queueItemKey
          ? `QueueItem=${queueItemKey}`
          : null,
        exceptionType
          ? `Exception=${exceptionType}`
          : null,
        message || null,
      ]
        .filter(Boolean)
        .join(" | ");

      await tx.execute(
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
            gen_random_uuid()::text,
            'RPA_RESULT_RECEIVED',
            'invoice',
            $1,
            $2,
            $3,
            $4
          )
        `,
        [
          invoiceId,
          description,
          new Date().toISOString(),
          organisationId,
        ]
      );

      return {
        invoiceId,
        invoiceNumber:
          invoice.invoiceNumber,
        robotName,
        status,
        message,
        queueItemKey,
        exceptionType,
      };
    }
  );
}

module.exports = {
  QUEUE_NAME,
  ALLOWED_RESULTS,
  listQueueCandidates,
  buildQueueTransaction,
  recordRobotResult,
};
