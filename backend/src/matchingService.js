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

function getSetting(
  key,
  fallback,
  organisationId
) {
  if (!organisationId) {
    return fallback;
  }

  const row = db.prepare(`
    SELECT setting_value
    FROM app_settings
    WHERE setting_key = ?
      AND organisation_id = ?
  `).get(
    key,
    organisationId
  );

  return row?.setting_value ?? fallback;
}

function createAudit(
  organisationId,
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

function getInvoice(invoiceId, organisationId) {
  return db.prepare(`
    SELECT i.*
    FROM invoices i
    INNER JOIN documents d
      ON d.id = i.document_id
    WHERE i.id = ?
      AND d.organisation_id = ?
  `).get(
    invoiceId,
    organisationId
  );
}

function getInvoiceItems(invoiceId) {
  return db.prepare(`
    SELECT *
    FROM invoice_line_items
    WHERE invoice_id = ?
    ORDER BY position
  `).all(invoiceId);
}

function getPurchaseOrder(
  poNumber,
  organisationId
) {
  if (!organisationId) {
    return null;
  }

  return db.prepare(`
    SELECT *
    FROM purchase_orders
    WHERE po_number = ?
      AND organisation_id = ?
  `).get(
    poNumber,
    organisationId
  );
}

function getPurchaseOrderItems(poId) {
  return db.prepare(`
    SELECT *
    FROM purchase_order_items
    WHERE purchase_order_id = ?
    ORDER BY position
  `).all(poId);
}

function compareLineItems(
  invoiceItems,
  poItems,
  tolerance
) {
  if (
    !invoiceItems.length ||
    invoiceItems.length !== poItems.length
  ) {
    return false;
  }

  return invoiceItems.every((invoiceItem) => {
    const poItem = poItems.find(
      (candidate) =>
        normalize(candidate.description) ===
        normalize(invoiceItem.description)
    );

    if (!poItem) return false;

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
  });
}

function createException(
  invoiceId,
  exceptionType,
  severity,
  description,
  organisationId
) {
  const existing = db.prepare(`
    SELECT id
    FROM exceptions
    WHERE invoice_id = ?
      AND exception_type = ?
      AND status = 'Open'
  `).get(
    invoiceId,
    exceptionType
  );

  if (existing) {
    return existing.id;
  }

  const id = randomUUID();

  db.prepare(`
    INSERT INTO exceptions (
      id,
      invoice_id,
      exception_type,
      severity,
      description,
      status,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, 'Open', ?)
  `).run(
    id,
    invoiceId,
    exceptionType,
    severity,
    description,
    new Date().toISOString()
  );

  createAudit(
    organisationId,

    "EXCEPTION_CREATED",
    "exception",
    id,
    description
  );

  return id;
}

function resolveSystemExceptions(
  invoiceId,
  organisationId
) {
  const now = new Date().toISOString();

  const open = db.prepare(`
    SELECT id
    FROM exceptions
    WHERE invoice_id = ?
      AND status = 'Open'
  `).all(invoiceId);

  db.prepare(`
    UPDATE exceptions
    SET
      status = 'Resolved',
      resolution = ?,
      resolved_at = ?
    WHERE invoice_id = ?
      AND status = 'Open'
  `).run(
    "Resolved automatically after successful re-match.",
    now,
    invoiceId
  );

  for (const item of open) {
    createAudit(
      organisationId,

      "EXCEPTION_AUTO_RESOLVED",
      "exception",
      item.id,
      "Resolved automatically after successful re-match."
    );
  }
}

function removeAutomaticApprovals(invoiceId) {
  db.prepare(`
    DELETE FROM approvals
    WHERE invoice_id = ?
      AND approval_type = 'Automatic'
  `).run(invoiceId);
}

function duplicateExists(
  invoice,
  organisationId
) {
  if (!organisationId) {
    return false;
  }

  if (
    getSetting(
      "duplicate_detection",
      "true",
      organisationId
    ) !== "true"
  ) {
    return false;
  }

  const duplicate = db.prepare(`
    SELECT i.id
    FROM invoices i
    INNER JOIN documents d
      ON d.id = i.document_id
    WHERE i.id <> ?
      AND i.invoice_number = ?
      AND i.supplier_name = ?
      AND i.total_amount = ?
      AND d.organisation_id = ?
    LIMIT 1
  `).get(
    invoice.id,
    invoice.invoice_number,
    invoice.supplier_name,
    invoice.total_amount,
    organisationId
  );

  return Boolean(duplicate);
}

function upsertMatch({
  invoice,
  po,
  checks,
  score,
  status,
  variance,
  details,
}) {
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT id
    FROM invoice_matches
    WHERE invoice_id = ?
  `).get(invoice.id);

  const id =
    existing?.id ||
    randomUUID();

  if (existing) {
    db.prepare(`
      UPDATE invoice_matches
      SET
        purchase_order_id = ?,
        supplier_match = ?,
        po_reference_match = ?,
        currency_match = ?,
        subtotal_match = ?,
        tax_match = ?,
        total_match = ?,
        line_items_match = ?,
        match_score = ?,
        match_status = ?,
        variance_amount = ?,
        details = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
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
      id
    );
  } else {
    db.prepare(`
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
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
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
      now
    );
  }

  return id;
}

function getMatch(
  invoiceId,
  organisationId
) {
  if (!organisationId) {
    return null;
  }

  const match = db.prepare(`
    SELECT
      im.id,
      im.invoice_id AS invoiceId,
      im.purchase_order_id AS purchaseOrderId,
      im.match_score AS matchScore,
      im.match_status AS matchStatus,
      im.variance_amount AS varianceAmount,
      im.details,
      im.created_at AS createdAt,
      im.updated_at AS updatedAt
    FROM invoice_matches im

    INNER JOIN invoices i
      ON i.id = im.invoice_id

    INNER JOIN documents d
      ON d.id = i.document_id

    WHERE
      im.invoice_id = ?
      AND d.organisation_id = ?
  `).get(
    invoiceId,
    organisationId
  );

  return match || null;
}

function saveExceptionMatch(
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

  const matchId = upsertMatch({
    invoice,
    po,
    checks,
    score: 0,
    status: "Exception",
    variance: 0,
    details,
  });

  createAudit(
    organisationId,

    "INVOICE_MATCH_EXCEPTION",
    "invoice",
    invoice.id,
    details
  );

  createAudit(
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

function matchInvoice(
  invoiceId,
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "Organisation context is required."
    );
  }
  const invoice = getInvoice(invoiceId, organisationId);

  if (!invoice) {
    throw new Error("Invoice not found.");
  }

  removeAutomaticApprovals(invoice.id);

  const duplicate =
    duplicateExists(invoice, organisationId);

  if (duplicate) {
    createException(
      invoice.id,
      "DUPLICATE_INVOICE",
      "High",
      `Potential duplicate invoice ${invoice.invoice_number} detected.`,
      organisationId
    );
  }

  if (!invoice.purchase_order_number) {
    createException(
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

  const po = getPurchaseOrder(
    invoice.purchase_order_number,
    organisationId
  );

  if (!po) {
    createException(
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
    getSetting("amount_tolerance",
      "1.00",
      organisationId
    )
  );

  const invoiceItems =
    getInvoiceItems(invoice.id);

  const poItems =
    getPurchaseOrderItems(po.id);

  const checks = {
    supplierMatch:
      normalize(invoice.supplier_name) ===
      normalize(po.supplier_name),

    poReferenceMatch:
      normalize(
        invoice.purchase_order_number
      ) ===
      normalize(po.po_number),

    currencyMatch:
      normalize(invoice.currency) ===
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

    createException(
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

    createException(
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

    createException(
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

    createException(
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
    getSetting("auto_approval_match_score",
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

  const matchId = upsertMatch({
    invoice,
    po,
    checks,
    score,
    status,
    variance,
    details,
  });

  if (matched) {
    resolveSystemExceptions(
      invoice.id,
      organisationId
    );

    const approvalId =
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
      approvalId,
      invoice.id,
      "Approved",
      "Automatic",
      "APPA Matching Engine",
      `Automatically approved after ${score}% PO match.`,
      new Date().toISOString()
    );

    db.prepare(`
      UPDATE purchase_orders
      SET
        status = 'Matched',
        updated_at = ?
      WHERE id = ?
    `).run(
      new Date().toISOString(),
      po.id
    );

    createAudit(
      organisationId,

      "INVOICE_AUTO_APPROVED",
      "invoice",
      invoice.id,
      `${invoice.invoice_number} automatically approved after ${score}% PO match`
    );
  } else {
    createAudit(
      organisationId,

      "INVOICE_MATCH_EXCEPTION",
      "invoice",
      invoice.id,
      `${invoice.invoice_number} requires review: ${details}`
    );
  }

  createAudit(
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
