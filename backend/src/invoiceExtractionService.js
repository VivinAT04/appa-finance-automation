const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const db = require("./database");

// Keep invoice extraction on the same storage path used by documentRoutes.
// Vercel provides writable temporary storage only under /tmp.
const uploadDir =
  process.env.VERCEL
    ? path.join("/tmp", "appa-finance-uploads")
    : path.join(__dirname, "..", "uploads");

function normalizeText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function capture(text, regex) {
  const match = text.match(regex);
  return match ? normalizeText(match[1]) : null;
}

function money(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = String(value)
    .replace(/[₹£$€,\s]/g, "")
    .replace(/INR|GBP|USD|EUR/gi, "")
    .trim();

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) ? parsed : null;
}

function detectCurrency(text) {
  if (/₹|\bINR\b/i.test(text)) return "INR";
  if (/£|\bGBP\b/i.test(text)) return "GBP";
  if (/\$|\bUSD\b/i.test(text)) return "USD";
  if (/€|\bEUR\b/i.test(text)) return "EUR";

  return "GBP";
}

function calculateConfidence(invoice) {
  const fields = [
    invoice.invoiceNumber,
    invoice.invoiceDate,
    invoice.dueDate,
    invoice.supplierName,
    invoice.purchaseOrderNumber,
    invoice.subtotal,
    invoice.taxAmount,
    invoice.totalAmount,
  ];

  const populated = fields.filter(
    (value) =>
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  ).length;

  return Number(((populated / fields.length) * 100).toFixed(2));
}

function validateInvoice(invoice) {
  const problems = [];

  if (!invoice.invoiceNumber) {
    problems.push("Invoice number missing");
  }

  if (!invoice.supplierName) {
    problems.push("Supplier missing");
  }

  if (!invoice.totalAmount) {
    problems.push("Total amount missing");
  }

  if (!invoice.purchaseOrderNumber) {
    problems.push("Purchase order reference missing");
  }

  if (
    invoice.subtotal !== null &&
    invoice.taxAmount !== null &&
    invoice.totalAmount !== null
  ) {
    const calculated = Number(
      (invoice.subtotal + invoice.taxAmount).toFixed(2)
    );

    const expected = Number(invoice.totalAmount.toFixed(2));

    if (calculated !== expected) {
      problems.push(
        `Total mismatch: subtotal + tax = ${calculated}, invoice total = ${expected}`
      );
    }
  }

  return {
    status: problems.length ? "Exception" : "Validated",
    message: problems.length
      ? problems.join("; ")
      : "Required invoice fields and arithmetic validated.",
  };
}

function parseLineItems(text) {
  const items = [];

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    /*
      Expected synthetic line format:
      Office Chairs   4   4500   18000
    */
    const match = line.match(
      /^(.+?)\s+(\d+(?:\.\d+)?)\s+([₹£$€]?\s*[\d,]+(?:\.\d+)?)\s+([₹£$€]?\s*[\d,]+(?:\.\d+)?)$/
    );

    if (!match) {
      continue;
    }

    const description = normalizeText(match[1]);

    if (
      /subtotal|total|gst|tax|invoice|description|qty|quantity/i.test(
        description
      )
    ) {
      continue;
    }

    const quantity = Number(match[2]);
    const unitPrice = money(match[3]);
    const lineTotal = money(match[4]);

    if (
      !description ||
      !Number.isFinite(quantity) ||
      unitPrice === null ||
      lineTotal === null
    ) {
      continue;
    }

    items.push({
      description,
      quantity,
      unitPrice,
      taxRate: null,
      lineTotal,
    });
  }

  return items;
}

function parseInvoiceText(rawText) {
  const text = normalizeText(rawText);

  const supplierBlock =
    capture(
      text,
      /Supplier:\s*\n?\s*([^\n]+)/i
    ) ||
    capture(
      text,
      /Vendor:\s*\n?\s*([^\n]+)/i
    );

  const invoice = {
    invoiceNumber: capture(
      text,
      /Invoice\s*(?:Number|No\.?|#)\s*:\s*([^\n]+)/i
    ),

    invoiceDate: capture(
      text,
      /Invoice\s*Date\s*:\s*([^\n]+)/i
    ),

    dueDate: capture(
      text,
      /Due\s*Date\s*:\s*([^\n]+)/i
    ),

    supplierName: supplierBlock,

    supplierEmail: capture(
      text,
      /(?:Supplier\s*)?Email\s*:\s*([^\s\n]+@[^\s\n]+)/i
    ),

    supplierTaxId:
      capture(
        text,
        /(?:GSTIN|GST\s*(?:No|Number)|Tax\s*ID)\s*:\s*([^\n]+)/i
      ) || null,

    currency: detectCurrency(text),

    purchaseOrderNumber:
      capture(
        text,
        /Purchase\s*Order\s*:\s*([^\n]+)/i
      ) ||
      capture(
        text,
        /\bPO\s*(?:Number|No\.?|#)\s*:\s*([^\n]+)/i
      ),

    subtotal: money(
      capture(
        text,
        /Subtotal\s*:\s*(?:INR|GBP|USD|EUR)?\s*([₹£$€]?\s*[\d,]+(?:\.\d+)?)/i
      )
    ),

    taxAmount: money(
      capture(
        text,
        /(?:GST(?:\s*\([^)]*\))?|Tax(?:\s*\([^)]*\))?)\s*:\s*(?:INR|GBP|USD|EUR)?\s*([₹£$€]?\s*[\d,]+(?:\.\d+)?)/i
      )
    ),

    totalAmount: money(
      capture(
        text,
        /\bTOTAL\s*:\s*(?:INR|GBP|USD|EUR)?\s*([₹£$€]?\s*[\d,]+(?:\.\d+)?)/i
      )
    ),
  };

  invoice.lineItems = parseLineItems(text);
  invoice.confidence = calculateConfidence(invoice);

  const validation = validateInvoice(invoice);

  invoice.validationStatus = validation.status;
  invoice.validationMessage = validation.message;

  return invoice;
}

async function extractPdfText(filePath) {
  /*
   * pdfjs-dist expects browser-style geometry globals.
   * In Node/Vercel they are provided by @napi-rs/canvas.
   */
  if (
    typeof globalThis.DOMMatrix === "undefined" ||
    typeof globalThis.ImageData === "undefined" ||
    typeof globalThis.Path2D === "undefined"
  ) {
    const canvas = require("@napi-rs/canvas");

    if (
      typeof globalThis.DOMMatrix === "undefined" &&
      canvas.DOMMatrix
    ) {
      globalThis.DOMMatrix = canvas.DOMMatrix;
    }

    if (
      typeof globalThis.ImageData === "undefined" &&
      canvas.ImageData
    ) {
      globalThis.ImageData = canvas.ImageData;
    }

    if (
      typeof globalThis.Path2D === "undefined" &&
      canvas.Path2D
    ) {
      globalThis.Path2D = canvas.Path2D;
    }
  }

  const pdfModule = require("pdf-parse");

  /*
    pdf-parse has had more than one CommonJS export shape.
    Support both so this project is not tied to one minor release.
  */
  if (typeof pdfModule === "function") {
    const result = await pdfModule(fs.readFileSync(filePath));
    return result.text || "";
  }

  if (typeof pdfModule.default === "function") {
    const result = await pdfModule.default(
      fs.readFileSync(filePath)
    );
    return result.text || "";
  }

  if (pdfModule.PDFParse) {
    const parser = new pdfModule.PDFParse({
      data: fs.readFileSync(filePath),
    });

    try {
      const result = await parser.getText();
      return result?.text || "";
    } finally {
      if (typeof parser.destroy === "function") {
        await parser.destroy();
      }
    }
  }

  throw new Error(
    "Installed pdf-parse version exposes an unsupported API."
  );
}

async function extractText(document) {
  const filePath = path.join(
    uploadDir,
    document.stored_name
  );

  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Stored document not found: ${document.stored_name}`
    );
  }

  if (document.mime_type === "application/pdf") {
    return extractPdfText(filePath);
  }

  throw new Error(
    "Image OCR adapter has not been configured yet. PDF extraction is currently supported."
  );
}

async function createAudit(
  organisationId,
  action,
  entityType,
  entityId,
  description,
  client = db
) {
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

async function processInvoiceDocument(
  documentId,
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "Organisation context is required."
    );
  }

  const document = await db.one(
    `
      SELECT *
      FROM documents
      WHERE id = $1
        AND organisation_id = $2
    `,
    [
      documentId,
      organisationId,
    ]
  );

  if (!document) {
    throw new Error(
      "Document not found."
    );
  }

  if (
    String(
      document.document_type
    ).toLowerCase() !== "invoice"
  ) {
    throw new Error(
      "Only documents classified as Invoice can be processed by the invoice extractor."
    );
  }

  await db.execute(
    `
      UPDATE documents
      SET
        status = $1,
        extraction_status = $2
      WHERE id = $3
        AND organisation_id = $4
    `,
    [
      "Processing",
      "Processing",
      documentId,
      organisationId,
    ]
  );

  try {
    const rawText =
      await extractText(document);

    if (!normalizeText(rawText)) {
      throw new Error(
        "No readable text could be extracted from the invoice."
      );
    }

    const invoice =
      parseInvoiceText(rawText);

    const now =
      new Date().toISOString();

    const existing = await db.one(
      `
        SELECT i.id
        FROM invoices i
        INNER JOIN documents d
          ON d.id = i.document_id
        WHERE i.document_id = $1
          AND d.organisation_id = $2
      `,
      [
        documentId,
        organisationId,
      ]
    );

    const invoiceId =
      existing?.id ||
      randomUUID();

    await db.transaction(
      async (tx) => {
        if (existing) {
          await tx.execute(
            `
              UPDATE invoices
              SET
                invoice_number = $1,
                invoice_date = $2,
                due_date = $3,
                supplier_name = $4,
                supplier_email = $5,
                supplier_tax_id = $6,
                currency = $7,
                subtotal = $8,
                tax_amount = $9,
                total_amount = $10,
                purchase_order_number = $11,
                extraction_confidence = $12,
                validation_status = $13,
                validation_message = $14,
                updated_at = $15
              WHERE id = $16
                AND document_id IN (
                  SELECT id
                  FROM documents
                  WHERE organisation_id = $17
                )
            `,
            [
              invoice.invoiceNumber,
              invoice.invoiceDate,
              invoice.dueDate,
              invoice.supplierName,
              invoice.supplierEmail,
              invoice.supplierTaxId,
              invoice.currency,
              invoice.subtotal,
              invoice.taxAmount,
              invoice.totalAmount,
              invoice.purchaseOrderNumber,
              invoice.confidence,
              invoice.validationStatus,
              invoice.validationMessage,
              now,
              invoiceId,
              organisationId,
            ]
          );

          await tx.execute(
            `
              DELETE FROM invoice_line_items
              WHERE invoice_id = $1
                AND invoice_id IN (
                  SELECT i.id
                  FROM invoices i
                  INNER JOIN documents d
                    ON d.id = i.document_id
                  WHERE d.organisation_id = $2
                )
            `,
            [
              invoiceId,
              organisationId,
            ]
          );
        } else {
          await tx.execute(
            `
              INSERT INTO invoices (
                id,
                document_id,
                invoice_number,
                invoice_date,
                due_date,
                supplier_name,
                supplier_email,
                supplier_tax_id,
                currency,
                subtotal,
                tax_amount,
                total_amount,
                purchase_order_number,
                extraction_confidence,
                validation_status,
                validation_message,
                created_at,
                updated_at
              )
              VALUES (
                $1, $2, $3, $4, $5, $6,
                $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17, $18
              )
            `,
            [
              invoiceId,
              documentId,
              invoice.invoiceNumber,
              invoice.invoiceDate,
              invoice.dueDate,
              invoice.supplierName,
              invoice.supplierEmail,
              invoice.supplierTaxId,
              invoice.currency,
              invoice.subtotal,
              invoice.taxAmount,
              invoice.totalAmount,
              invoice.purchaseOrderNumber,
              invoice.confidence,
              invoice.validationStatus,
              invoice.validationMessage,
              now,
              now,
            ]
          );
        }

        for (
          let index = 0;
          index < invoice.lineItems.length;
          index += 1
        ) {
          const item =
            invoice.lineItems[index];

          await tx.execute(
            `
              INSERT INTO invoice_line_items (
                id,
                invoice_id,
                description,
                quantity,
                unit_price,
                tax_rate,
                line_total,
                position,
                created_at
              )
              VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8, $9
              )
            `,
            [
              randomUUID(),
              invoiceId,
              item.description,
              item.quantity,
              item.unitPrice,
              item.taxRate,
              item.lineTotal,
              index + 1,
              now,
            ]
          );
        }

        await tx.execute(
          `
            UPDATE documents
            SET
              status = $1,
              extraction_status = $2
            WHERE id = $3
              AND organisation_id = $4
          `,
          [
            invoice.validationStatus ===
            "Exception"
              ? "Needs Review"
              : "Processed",
            "Completed",
            documentId,
            organisationId,
          ]
        );
      }
    );

    await createAudit(
      organisationId,
      "INVOICE_EXTRACTED",
      "invoice",
      invoiceId,
      `${document.original_name} extracted with ${invoice.confidence}% confidence`
    );

    await createAudit(
      organisationId,
      invoice.validationStatus ===
        "Validated"
        ? "INVOICE_VALIDATED"
        : "INVOICE_EXCEPTION",
      "invoice",
      invoiceId,
      invoice.validationMessage
    );

    return getInvoiceById(
      invoiceId,
      organisationId
    );
  } catch (error) {
    try {
      await db.execute(
        `
          UPDATE documents
          SET
            status = $1,
            extraction_status = $2
          WHERE id = $3
            AND organisation_id = $4
        `,
        [
          "Needs Review",
          "Failed",
          documentId,
          organisationId,
        ]
      );

      await createAudit(
        organisationId,
        "INVOICE_EXTRACTION_FAILED",
        "document",
        documentId,
        error.message
      );
    } catch (recoveryError) {
      console.error(
        "Invoice extraction failure state could not be recorded:",
        recoveryError.message
      );
    }

    throw error;
  }
}

async function getInvoiceById(
  invoiceId,
  organisationId
) {
  if (!organisationId) {
    return null;
  }

  const invoice = await db.one(
    `
      SELECT
        i.id,
        i.document_id AS "documentId",
        d.original_name AS "documentName",

        i.invoice_number AS "invoiceNumber",
        i.invoice_date AS "invoiceDate",
        i.due_date AS "dueDate",

        i.supplier_name AS "supplierName",
        i.supplier_email AS "supplierEmail",
        i.supplier_tax_id AS "supplierTaxId",

        i.currency,
        i.subtotal,
        i.tax_amount AS "taxAmount",
        i.total_amount AS "totalAmount",

        i.purchase_order_number AS "purchaseOrderNumber",

        i.extraction_confidence AS "extractionConfidence",
        i.validation_status AS "validationStatus",
        i.validation_message AS "validationMessage",

        i.created_at AS "createdAt",
        i.updated_at AS "updatedAt",

        d.status AS "documentStatus",
        d.extraction_status AS "extractionStatus"

      FROM invoices i
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE i.id = $1
        AND d.organisation_id = $2
    `,
    [
      invoiceId,
      organisationId,
    ]
  );

  if (!invoice) {
    return null;
  }

  invoice.lineItems =
    await db.many(
      `
        SELECT
          li.id,
          li.description,
          li.quantity,
          li.unit_price AS "unitPrice",
          li.tax_rate AS "taxRate",
          li.line_total AS "lineTotal",
          li.position
        FROM invoice_line_items li
        INNER JOIN invoices i
          ON i.id = li.invoice_id
        INNER JOIN documents d
          ON d.id = i.document_id
        WHERE li.invoice_id = $1
          AND d.organisation_id = $2
        ORDER BY li.position ASC
      `,
      [
        invoiceId,
        organisationId,
      ]
    );

  return invoice;
}

async function getInvoiceByDocumentId(
  documentId,
  organisationId
) {
  if (!organisationId) {
    return null;
  }

  const row = await db.one(
    `
      SELECT i.id
      FROM invoices i
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE i.document_id = $1
        AND d.organisation_id = $2
    `,
    [
      documentId,
      organisationId,
    ]
  );

  return row
    ? getInvoiceById(
        row.id,
        organisationId
      )
    : null;
}

async function listInvoices(
  organisationId
) {
  if (!organisationId) {
    return [];
  }

  const rows = await db.many(
    `
      SELECT i.id
      FROM invoices i
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE d.organisation_id = $1
      ORDER BY i.created_at DESC
    `,
    [organisationId]
  );

  return Promise.all(
    rows.map((row) =>
      getInvoiceById(
        row.id,
        organisationId
      )
    )
  );
}

module.exports = {
  parseInvoiceText,
  processInvoiceDocument,
  getInvoiceById,
  getInvoiceByDocumentId,
  listInvoices,
};
