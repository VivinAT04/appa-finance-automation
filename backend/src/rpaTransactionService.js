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

      const now =
        new Date().toISOString();

      const safeMessage =
        String(
          message || ""
        ).trim();

      const description = [
        robotName,
        status,
        queueItemKey
          ? `QueueItem=${queueItemKey}`
          : null,
        exceptionType
          ? `Exception=${exceptionType}`
          : null,
        safeMessage || null,
      ]
        .filter(Boolean)
        .join(" | ");

      /*
       * Always preserve the raw robot callback in the
       * immutable audit trail.
       */
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
          now,
          organisationId,
        ]
      );

      /*
       * A robot execution result is intentionally kept
       * separate from invoice_matches.
       *
       * Successful means the UiPath transaction completed.
       * It does NOT automatically mean the accounting
       * invoice/PO match itself is Matched.
       */
      const runId =
        queueItemKey
          ? `uipath-${queueItemKey}`
          : `uipath-${invoiceId}-${Date.now()}`;

      const runStatus =
        status === "Successful"
          ? "Completed"
          : "Completed with exceptions";

      const succeeded =
        status === "Successful"
          ? 1
          : 0;

      const failed =
        status === "Successful"
          ? 0
          : 1;

      await tx.execute(
        `
          INSERT INTO automation_runs (
            id,
            process_name,
            source,
            status,
            items_processed,
            items_succeeded,
            items_failed,
            started_at,
            completed_at,
            details,
            organisation_id
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            1,
            $5,
            $6,
            $7,
            $7,
            $8,
            $9
          )
          ON CONFLICT (id)
          DO UPDATE SET
            status = EXCLUDED.status,
            items_processed =
              EXCLUDED.items_processed,
            items_succeeded =
              EXCLUDED.items_succeeded,
            items_failed =
              EXCLUDED.items_failed,
            completed_at =
              EXCLUDED.completed_at,
            details =
              EXCLUDED.details
          WHERE
            automation_runs.organisation_id =
              EXCLUDED.organisation_id
        `,
        [
          runId,
          "UiPath Invoice Performer",
          robotName || "UiPath Robot",
          runStatus,
          succeeded,
          failed,
          now,
          description,
          organisationId,
        ]
      );

      let exceptionId = null;

      if (
        status === "BusinessException" ||
        status === "ApplicationException"
      ) {
        const rpaExceptionType =
          status === "BusinessException"
            ? "RPA Business Exception"
            : "RPA Application Exception";

        const severity =
          status === "BusinessException"
            ? "Medium"
            : "High";

        const exceptionDescription =
          safeMessage ||
          (
            status === "BusinessException"
              ? "UiPath reported a business-rule exception."
              : "UiPath reported an application exception."
          );

        /*
         * Avoid duplicate OPEN exceptions when Orchestrator
         * retries the same callback.
         *
         * Organisation ownership is verified through:
         * exceptions -> invoices -> documents.
         */
        const existingException =
          await tx.one(
            `
              SELECT e.id
              FROM exceptions e

              INNER JOIN invoices i
                ON i.id = e.invoice_id

              INNER JOIN documents d
                ON d.id = i.document_id

              WHERE
                e.invoice_id = $1
                AND e.exception_type = $2
                AND e.status = 'Open'
                AND d.organisation_id = $3

              LIMIT 1
            `,
            [
              invoiceId,
              rpaExceptionType,
              organisationId,
            ]
          );

        if (existingException) {
          exceptionId =
            existingException.id;

          await tx.execute(
            `
              UPDATE exceptions
              SET
                severity = $1,
                description = $2
              WHERE
                id = $3
                AND invoice_id = $4
            `,
            [
              severity,
              exceptionDescription,
              exceptionId,
              invoiceId,
            ]
          );
        } else {
          const inserted =
            await tx.one(
              `
                INSERT INTO exceptions (
                  id,
                  invoice_id,
                  exception_type,
                  severity,
                  description,
                  status,
                  created_at
                )
                VALUES (
                  gen_random_uuid()::text,
                  $1,
                  $2,
                  $3,
                  $4,
                  'Open',
                  $5
                )
                RETURNING id
              `,
              [
                invoiceId,
                rpaExceptionType,
                severity,
                exceptionDescription,
                now,
              ]
            );

          exceptionId =
            inserted.id;

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
                'RPA_EXCEPTION_CREATED',
                'exception',
                $1,
                $2,
                $3,
                $4
              )
            `,
            [
              exceptionId,
              `${invoice.invoiceNumber}: ${exceptionDescription}`,
              now,
              organisationId,
            ]
          );
        }
      }

      if (status === "Successful") {
        /*
         * Resolve only exceptions created by the UiPath
         * integration. Existing AP/PO matching exceptions
         * remain untouched.
         */
        const openRpaExceptions =
          await tx.many(
            `
              SELECT e.id
              FROM exceptions e

              INNER JOIN invoices i
                ON i.id = e.invoice_id

              INNER JOIN documents d
                ON d.id = i.document_id

              WHERE
                e.invoice_id = $1
                AND e.status = 'Open'
                AND e.exception_type IN (
                  'RPA Business Exception',
                  'RPA Application Exception'
                )
                AND d.organisation_id = $2
            `,
            [
              invoiceId,
              organisationId,
            ]
          );

        if (openRpaExceptions.length > 0) {
          await tx.execute(
            `
              UPDATE exceptions
              SET
                status = 'Resolved',
                resolution = $1,
                resolved_at = $2
              WHERE
                invoice_id = $3
                AND status = 'Open'
                AND exception_type IN (
                  'RPA Business Exception',
                  'RPA Application Exception'
                )
                AND invoice_id IN (
                  SELECT i.id
                  FROM invoices i

                  INNER JOIN documents d
                    ON d.id = i.document_id

                  WHERE
                    d.organisation_id = $4
                )
            `,
            [
              "Resolved automatically after a successful UiPath transaction.",
              now,
              invoiceId,
              organisationId,
            ]
          );

          for (
            const resolvedException
            of openRpaExceptions
          ) {
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
                  'RPA_EXCEPTION_RESOLVED',
                  'exception',
                  $1,
                  $2,
                  $3,
                  $4
                )
              `,
              [
                resolvedException.id,
                `${invoice.invoiceNumber}: resolved after successful UiPath processing.`,
                now,
                organisationId,
              ]
            );
          }
        }
      }

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
            'RPA_TRANSACTION_COMPLETED',
            'automation_run',
            $1,
            $2,
            $3,
            $4
          )
        `,
        [
          runId,
          `${invoice.invoiceNumber}: ${status}`,
          now,
          organisationId,
        ]
      );

      return {
        invoiceId,
        invoiceNumber:
          invoice.invoiceNumber,
        robotName,
        status,
        message:
          safeMessage,
        queueItemKey,
        exceptionType,
        automationRunId:
          runId,
        exceptionId,
        financeStateApplied:
          true,
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
