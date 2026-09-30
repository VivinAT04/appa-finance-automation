const { randomUUID } = require("crypto");
const db = require("./database");

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function almostEqual(a, b, tolerance = 1) {
  if (a === null || a === undefined) return false;
  if (b === null || b === undefined) return false;

  return (
    Math.abs(Number(a) - Number(b)) <=
    Number(tolerance)
  );
}

async function getSetting(
  key,
  fallback,
  organisationId
) {
  if (!organisationId) {
    return fallback;
  }

  const row = await db.one(
    `
      SELECT setting_value
      FROM app_settings
      WHERE setting_key = $1
        AND organisation_id = $2
    `,
    [key, organisationId]
  );

  return row?.setting_value ?? fallback;
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

async function getInvoice(
  invoiceId,
  organisationId
) {
  return db.one(
    `
      SELECT i.*
      FROM invoices i
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE i.id = $1
        AND d.organisation_id = $2
    `,
    [invoiceId, organisationId]
  );
}

async function getInvoiceItems(
  invoiceId
) {
  return db.many(
    `
      SELECT *
      FROM invoice_line_items
      WHERE invoice_id = $1
      ORDER BY position
    `,
    [invoiceId]
  );
}

async function getPurchaseOrder(
  poNumber,
  organisationId
) {
  if (!organisationId) {
    return null;
  }

  return db.one(
    `
      SELECT
        po.*,
        s.name AS supplier_name,
        s.supplier_code AS supplier_code
      FROM purchase_orders po
      INNER JOIN suppliers s
        ON s.id = po.supplier_id
        AND s.organisation_id =
            po.organisation_id
      WHERE po.po_number = $1
        AND po.organisation_id = $2
    `,
    [poNumber, organisationId]
  );
}

async function getPurchaseOrderItems(
  poId
) {
  return db.many(
    `
      SELECT *
      FROM purchase_order_items
      WHERE purchase_order_id = $1
      ORDER BY position
    `,
    [poId]
  );
}

function compareLineItems(
  invoiceItems,
  poItems,
  tolerance
) {
  if (
    !invoiceItems.length ||
    invoiceItems.length !==
      poItems.length
  ) {
    return false;
  }

  return invoiceItems.every(
    (invoiceItem) => {
      const poItem = poItems.find(
        (candidate) =>
          normalize(
            candidate.description
          ) ===
          normalize(
            invoiceItem.description
          )
      );

      if (!poItem) {
        return false;
      }

      return (
        almostEqual(
          invoiceItem.quantity,
          poItem.quantity,
          0
        ) &&
        almostEqual(
          invoiceItem.unit_price,
          poItem.unit_price,
          tolerance
        ) &&
        almostEqual(
          invoiceItem.line_total,
          poItem.line_total,
          tolerance
        )
      );
    }
  );
}

async function createException(
  invoiceId,
  exceptionType,
  severity,
  description,
  organisationId
) {
  const existing = await db.one(
    `
      SELECT e.id
      FROM exceptions e
      INNER JOIN invoices i
        ON i.id = e.invoice_id
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE e.invoice_id = $1
        AND e.exception_type = $2
        AND e.status = 'Open'
        AND d.organisation_id = $3
    `,
    [
      invoiceId,
      exceptionType,
      organisationId,
    ]
  );

  if (existing) {
    return existing.id;
  }

  const id = randomUUID();

  await db.execute(
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
        $1, $2, $3, $4, $5,
        'Open', $6
      )
    `,
    [
      id,
      invoiceId,
      exceptionType,
      severity,
      description,
      new Date().toISOString(),
    ]
  );

  await createAudit(
    organisationId,
    "EXCEPTION_CREATED",
    "exception",
    id,
    description
  );

  return id;
}

async function resolveSystemExceptions(
  invoiceId,
  organisationId
) {
  const now =
    new Date().toISOString();

  const open = await db.many(
    `
      SELECT e.id
      FROM exceptions e
      INNER JOIN invoices i
        ON i.id = e.invoice_id
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE e.invoice_id = $1
        AND e.status = 'Open'
        AND d.organisation_id = $2
    `,
    [
      invoiceId,
      organisationId,
    ]
  );

  await db.execute(
    `
      UPDATE exceptions
      SET
        status = 'Resolved',
        resolution = $1,
        resolved_at = $2
      WHERE invoice_id = $3
        AND status = 'Open'
        AND invoice_id IN (
          SELECT i.id
          FROM invoices i
          INNER JOIN documents d
            ON d.id = i.document_id
          WHERE d.organisation_id = $4
        )
    `,
    [
      "Resolved automatically after successful re-match.",
      now,
      invoiceId,
      organisationId,
    ]
  );

  for (const item of open) {
    await createAudit(
      organisationId,
      "EXCEPTION_AUTO_RESOLVED",
      "exception",
      item.id,
      "Resolved automatically after successful re-match."
    );
  }
}

async function removeAutomaticApprovals(
  invoiceId,
  organisationId
) {
  await db.execute(
    `
      DELETE FROM approvals
      WHERE invoice_id = $1
        AND approval_type = 'Automatic'
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
}

async function duplicateExists(
  invoice,
  organisationId
) {
  if (!organisationId) {
    return false;
  }

  if (
    await getSetting(
      "duplicate_detection",
      "true",
      organisationId
    ) !== "true"
  ) {
    return false;
  }

  const duplicate = await db.one(
    `
      SELECT i.id
      FROM invoices i
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE i.id <> $1
        AND i.invoice_number = $2
        AND i.supplier_name = $3
        AND i.total_amount = $4
        AND d.organisation_id = $5
      LIMIT 1
    `,
    [
      invoice.id,
      invoice.invoice_number,
      invoice.supplier_name,
      invoice.total_amount,
      organisationId,
    ]
  );

  return Boolean(duplicate);
}

async function upsertMatch({
  invoice,
  po,
  checks,
  score,
  status,
  variance,
  details,
}) {
  const now =
    new Date().toISOString();

  const existing = await db.one(
    `
      SELECT id
      FROM invoice_matches
      WHERE invoice_id = $1
    `,
    [invoice.id]
  );

  const id =
    existing?.id ||
    randomUUID();

  if (existing) {
    await db.execute(
      `
        UPDATE invoice_matches
        SET
          purchase_order_id = $1,
          supplier_match = $2,
          po_reference_match = $3,
          currency_match = $4,
          subtotal_match = $5,
          tax_match = $6,
          total_match = $7,
          line_items_match = $8,
          match_score = $9,
          match_status = $10,
          variance_amount = $11,
          details = $12,
          updated_at = $13
        WHERE id = $14
      `,
      [
        po?.id || null,
        Number(checks.supplierMatch),
        Number(checks.poReferenceMatch),
        Number(checks.currencyMatch),
        Number(checks.subtotalMatch),
        Number(checks.taxMatch),
        Number(checks.totalMatch),
        Number(checks.lineItemsMatch),
        score,
        status,
        variance,
        details,
        now,
        id,
      ]
    );
  } else {
    await db.execute(
      `
        INSERT INTO invoice_matches (
          id,
          invoice_id,
          purchase_order_id,
          supplier_match,
          po_reference_match,
          currency_match,
          subtotal_match,
          tax_match,
          total_match,
          line_items_match,
          match_score,
          match_status,
          variance_amount,
          details,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16
        )
      `,
      [
        id,
        invoice.id,
        po?.id || null,
        Number(checks.supplierMatch),
        Number(checks.poReferenceMatch),
        Number(checks.currencyMatch),
        Number(checks.subtotalMatch),
        Number(checks.taxMatch),
        Number(checks.totalMatch),
        Number(checks.lineItemsMatch),
        score,
        status,
        variance,
        details,
        now,
        now,
      ]
    );
  }

  return id;
}

async function getMatch(
  invoiceId,
  organisationId
) {
  if (!organisationId) {
    return null;
  }

  const match = await db.one(
    `
      SELECT
        im.id,
        im.invoice_id AS "invoiceId",
        im.purchase_order_id AS "purchaseOrderId",
        im.match_score AS "matchScore",
        im.match_status AS "matchStatus",
        im.variance_amount AS "varianceAmount",
        im.details,
        im.created_at AS "createdAt",
        im.updated_at AS "updatedAt"
      FROM invoice_matches im
      INNER JOIN invoices i
        ON i.id = im.invoice_id
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE im.invoice_id = $1
        AND d.organisation_id = $2
    `,
    [
      invoiceId,
      organisationId,
    ]
  );

  return match || null;
}

async function saveExceptionMatch(
  invoice,
  po,
  details,
  organisationId
) {
  const checks = {
    supplierMatch: false,
    poReferenceMatch: false,
    currencyMatch: false,
    subtotalMatch: false,
    taxMatch: false,
    totalMatch: false,
    lineItemsMatch: false,
  };

  const matchId =
    await upsertMatch({
      invoice,
      po,
      checks,
      score: 0,
      status: "Exception",
      variance: 0,
      details,
    });

  await createAudit(
    organisationId,
    "INVOICE_MATCH_EXCEPTION",
    "invoice",
    invoice.id,
    details
  );

  await createAudit(
    organisationId,
    "PO_MATCH_COMPLETED",
    "invoice_match",
    matchId,
    `${invoice.invoice_number}: Exception (0%)`
  );

  return getMatch(
    invoice.id,
    organisationId
  );
}

async function matchInvoice(
  invoiceId,
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "Organisation context is required."
    );
  }

  const invoice =
    await getInvoice(
      invoiceId,
      organisationId
    );

  if (!invoice) {
    throw new Error(
      "Invoice not found."
    );
  }

  await removeAutomaticApprovals(
    invoice.id,
    organisationId
  );

  const duplicate =
    await duplicateExists(
      invoice,
      organisationId
    );

  if (duplicate) {
    await createException(
      invoice.id,
      "DUPLICATE_INVOICE",
      "High",
      `Potential duplicate invoice ${invoice.invoice_number} detected.`,
      organisationId
    );
  }

  if (
    !invoice.purchase_order_number
  ) {
    await createException(
      invoice.id,
      "MISSING_PO_REFERENCE",
      "High",
      "Invoice does not contain a purchase order reference.",
      organisationId
    );

    return saveExceptionMatch(
      invoice,
      null,
      "Purchase order reference missing.",
      organisationId
    );
  }

  const po =
    await getPurchaseOrder(
      invoice.purchase_order_number,
      organisationId
    );

  if (!po) {
    await createException(
      invoice.id,
      "PURCHASE_ORDER_NOT_FOUND",
      "High",
      `Purchase order ${invoice.purchase_order_number} was not found.`,
      organisationId
    );

    return saveExceptionMatch(
      invoice,
      null,
      "Referenced purchase order was not found.",
      organisationId
    );
  }

  const tolerance = Number(
    await getSetting(
      "amount_tolerance",
      "1.00",
      organisationId
    )
  );

  const invoiceItems =
    await getInvoiceItems(
      invoice.id
    );

  const poItems =
    await getPurchaseOrderItems(
      po.id
    );

  const checks = {
    supplierMatch:
      normalize(
        invoice.supplier_name
      ) ===
      normalize(
        po.supplier_name
      ),

    poReferenceMatch:
      normalize(
        invoice.purchase_order_number
      ) ===
      normalize(po.po_number),

    currencyMatch:
      normalize(
        invoice.currency
      ) ===
      normalize(po.currency),

    subtotalMatch:
      almostEqual(
        invoice.subtotal,
        po.subtotal,
        tolerance
      ),

    taxMatch:
      almostEqual(
        invoice.tax_amount,
        po.tax_amount,
        tolerance
      ),

    totalMatch:
      almostEqual(
        invoice.total_amount,
        po.total_amount,
        tolerance
      ),

    lineItemsMatch:
      compareLineItems(
        invoiceItems,
        poItems,
        tolerance
      ),
  };

  const results =
    Object.values(checks);

  const passed =
    results.filter(Boolean).length;

  const score = Number(
    (
      (passed / results.length) *
      100
    ).toFixed(2)
  );

  const variance = Number(
    (
      Number(
        invoice.total_amount || 0
      ) -
      Number(
        po.total_amount || 0
      )
    ).toFixed(2)
  );

  const failures = [];

  if (!checks.supplierMatch) {
    failures.push(
      "Supplier mismatch"
    );

    await createException(
      invoice.id,
      "SUPPLIER_MISMATCH",
      "High",
      `Invoice supplier "${invoice.supplier_name}" does not match PO supplier "${po.supplier_name}".`,
      organisationId
    );
  }

  if (!checks.poReferenceMatch) {
    failures.push(
      "PO reference mismatch"
    );
  }

  if (!checks.currencyMatch) {
    failures.push(
      "Currency mismatch"
    );

    await createException(
      invoice.id,
      "CURRENCY_MISMATCH",
      "High",
      `Invoice currency ${invoice.currency} does not match PO currency ${po.currency}.`,
      organisationId
    );
  }

  if (!checks.subtotalMatch) {
    failures.push(
      "Subtotal mismatch"
    );
  }

  if (!checks.taxMatch) {
    failures.push(
      "Tax mismatch"
    );
  }

  if (!checks.totalMatch) {
    failures.push(
      "Total mismatch"
    );

    await createException(
      invoice.id,
      "AMOUNT_MISMATCH",
      "High",
      `Invoice total ${invoice.total_amount} differs from PO total ${po.total_amount}.`,
      organisationId
    );
  }

  if (!checks.lineItemsMatch) {
    failures.push(
      "Line item mismatch"
    );

    await createException(
      invoice.id,
      "LINE_ITEM_MISMATCH",
      "Medium",
      "Invoice quantities, unit prices or line totals do not fully match the purchase order.",
      organisationId
    );
  }

  if (duplicate) {
    failures.push(
      "Potential duplicate invoice"
    );
  }

  const threshold = Number(
    await getSetting(
      "auto_approval_match_score",
      "100",
      organisationId
    )
  );

  const matched =
    score >= threshold &&
    failures.length === 0;

  const status =
    matched
      ? "Matched"
      : "Exception";

  const details =
    matched
      ? "Invoice successfully matched to purchase order."
      : failures.join("; ");

  const matchId =
    await upsertMatch({
      invoice,
      po,
      checks,
      score,
      status,
      variance,
      details,
    });

  if (matched) {
    await resolveSystemExceptions(
      invoice.id,
      organisationId
    );

    const approvalId =
      randomUUID();

    await db.execute(
      `
        INSERT INTO approvals (
          id,
          invoice_id,
          decision,
          approval_type,
          approver,
          comments,
          created_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7
        )
      `,
      [
        approvalId,
        invoice.id,
        "Approved",
        "Automatic",
        "APPA Matching Engine",
        `Automatically approved after ${score}% PO match.`,
        new Date().toISOString(),
      ]
    );

    await db.execute(
      `
        UPDATE purchase_orders
        SET
          status = 'Matched',
          updated_at = $1
        WHERE id = $2
          AND organisation_id = $3
      `,
      [
        new Date().toISOString(),
        po.id,
        organisationId,
      ]
    );

    await createAudit(
      organisationId,
      "INVOICE_AUTO_APPROVED",
      "invoice",
      invoice.id,
      `${invoice.invoice_number} automatically approved after ${score}% PO match`
    );
  } else {
    await createAudit(
      organisationId,
      "INVOICE_MATCH_EXCEPTION",
      "invoice",
      invoice.id,
      `${invoice.invoice_number} requires review: ${details}`
    );
  }

  await createAudit(
    organisationId,
    "PO_MATCH_COMPLETED",
    "invoice_match",
    matchId,
    `${invoice.invoice_number}: ${status} (${score}%)`
  );

  return getMatch(
    invoice.id,
    organisationId
  );
}

module.exports = {
  matchInvoice,
  getMatch,
};
