const {
  randomUUID,
} = require("crypto");

const db =
  require("../src/database");

const {
  matchInvoice,
  getMatch,
} = require("../src/matchingService");

const TEST_ORG =
  "org-cross-isolation-test";

const TEST_PREFIX =
  "E2E-CROSS-ORG";

const now =
  () => new Date().toISOString();

function assert(
  condition,
  message
) {
  if (!condition) {
    throw new Error(
      `ASSERTION FAILED: ${message}`
    );
  }

  console.log(
    `✓ ${message}`
  );
}

function cleanup() {
  const docs =
    db.prepare(`
      SELECT id
      FROM documents
      WHERE organisation_id = ?
    `).all(TEST_ORG);

  const docIds =
    docs.map(
      (row) => row.id
    );

  if (docIds.length) {
    const placeholders =
      docIds.map(() => "?").join(",");

    const invoices =
      db.prepare(`
        SELECT id
        FROM invoices
        WHERE document_id IN (
          ${placeholders}
        )
      `).all(
        ...docIds
      );

    const invoiceIds =
      invoices.map(
        (row) => row.id
      );

    if (invoiceIds.length) {
      const invoicePlaceholders =
        invoiceIds
          .map(() => "?")
          .join(",");

      db.prepare(`
        DELETE FROM approvals
        WHERE invoice_id IN (
          ${invoicePlaceholders}
        )
      `).run(
        ...invoiceIds
      );

      db.prepare(`
        DELETE FROM exceptions
        WHERE invoice_id IN (
          ${invoicePlaceholders}
        )
      `).run(
        ...invoiceIds
      );

      db.prepare(`
        DELETE FROM invoice_matches
        WHERE invoice_id IN (
          ${invoicePlaceholders}
        )
      `).run(
        ...invoiceIds
      );

      db.prepare(`
        DELETE FROM invoice_line_items
        WHERE invoice_id IN (
          ${invoicePlaceholders}
        )
      `).run(
        ...invoiceIds
      );

      db.prepare(`
        DELETE FROM invoices
        WHERE id IN (
          ${invoicePlaceholders}
        )
      `).run(
        ...invoiceIds
      );
    }

    db.prepare(`
      DELETE FROM documents
      WHERE organisation_id = ?
    `).run(
      TEST_ORG
    );
  }

  db.prepare(`
    DELETE FROM automation_runs
    WHERE organisation_id = ?
  `).run(
    TEST_ORG
  );

  db.prepare(`
    DELETE FROM audit_logs
    WHERE organisation_id = ?
  `).run(
    TEST_ORG
  );

  db.prepare(`
    DELETE FROM app_settings
    WHERE organisation_id = ?
  `).run(
    TEST_ORG
  );

  const pos =
    db.prepare(`
      SELECT id
      FROM purchase_orders
      WHERE organisation_id = ?
    `).all(
      TEST_ORG
    );

  for (const po of pos) {
    db.prepare(`
      DELETE FROM purchase_order_items
      WHERE purchase_order_id = ?
    `).run(
      po.id
    );
  }

  db.prepare(`
    DELETE FROM purchase_orders
    WHERE organisation_id = ?
  `).run(
    TEST_ORG
  );

  db.prepare(`
    DELETE FROM suppliers
    WHERE organisation_id = ?
  `).run(
    TEST_ORG
  );

  db.prepare(`
    DELETE FROM organisation_memberships
    WHERE organisation_id = ?
  `).run(
    TEST_ORG
  );

  db.prepare(`
    DELETE FROM organisations
    WHERE id = ?
  `).run(
    TEST_ORG
  );
}

async function main() {
  cleanup();

  const appa =
    db.prepare(`
      SELECT id
      FROM organisations
      WHERE code = 'APPA'
      LIMIT 1
    `).get();

  assert(
    appa,
    "APPA organisation exists"
  );

  const timestamp =
    now();

  db.prepare(`
    INSERT INTO organisations (
      id,
      name,
      code,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'Active', ?, ?)
  `).run(
    TEST_ORG,
    "Cross Organisation Test Ltd",
    "CROSSISO",
    timestamp,
    timestamp
  );

  const appaSupplier =
    db.prepare(`
      SELECT *
      FROM suppliers
      WHERE organisation_id = ?
      ORDER BY created_at
      LIMIT 1
    `).get(
      appa.id
    );

  assert(
    appaSupplier,
    "APPA supplier exists for shared-code test"
  );

  const appaPO =
    db.prepare(`
      SELECT *
      FROM purchase_orders
      WHERE organisation_id = ?
      ORDER BY created_at
      LIMIT 1
    `).get(
      appa.id
    );

  assert(
    appaPO,
    "APPA purchase order exists for shared-number test"
  );

  const supplierId =
    randomUUID();

  db.prepare(`
    INSERT INTO suppliers (
      id,
      supplier_code,
      name,
      email,
      tax_id,
      payment_terms_days,
      status,
      created_at,
      updated_at,
      organisation_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    supplierId,
    appaSupplier.supplier_code,
    `${TEST_PREFIX} Supplier`,
    "cross-isolation@example.test",
    "CROSS-TEST-TAX",
    30,
    "Active",
    timestamp,
    timestamp,
    TEST_ORG
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM suppliers
      WHERE supplier_code = ?
    `).get(
      appaSupplier.supplier_code
    ).count >= 2,
    "same supplier code can exist across organisations"
  );

  const poId =
    randomUUID();

  db.prepare(`
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    poId,
    appaPO.po_number,
    supplierId,
    "2026-09-30",
    "INR",
    100,
    18,
    118,
    "Open",
    timestamp,
    timestamp,
    TEST_ORG
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM purchase_orders
      WHERE po_number = ?
    `).get(
      appaPO.po_number
    ).count >= 2,
    "same PO number can exist across organisations"
  );

  db.prepare(`
    INSERT INTO purchase_order_items (
      id,
      purchase_order_id,
      description,
      quantity,
      unit_price,
      line_total,
      position,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    poId,
    "Cross Organisation Test Item",
    1,
    100,
    100,
    0,
    timestamp
  );

  const appaSetting =
    db.prepare(`
      SELECT *
      FROM app_settings
      WHERE organisation_id = ?
      ORDER BY setting_key
      LIMIT 1
    `).get(
      appa.id
    );

  assert(
    appaSetting,
    "APPA setting exists for shared-key test"
  );

  db.prepare(`
    INSERT INTO app_settings (
      organisation_id,
      setting_key,
      setting_value,
      description,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    TEST_ORG,
    appaSetting.setting_key,
    appaSetting.setting_value,
    "Cross-company isolation test",
    timestamp
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM app_settings
      WHERE setting_key = ?
    `).get(
      appaSetting.setting_key
    ).count >= 2,
    "same setting key can exist across organisations"
  );

  for (const [key, value] of [
    ["amount_tolerance", "1.00"],
    ["auto_approval_match_score", "100"],
    ["duplicate_detection", "true"],
  ]) {
    db.prepare(`
      INSERT INTO app_settings (
        organisation_id,
        setting_key,
        setting_value,
        description,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(
        organisation_id,
        setting_key
      )
      DO UPDATE SET
        setting_value =
          excluded.setting_value,
        updated_at =
          excluded.updated_at
    `).run(
      TEST_ORG,
      key,
      value,
      "Cross-company E2E setting",
      timestamp
    );
  }

  const documentId =
    randomUUID();

  db.prepare(`
    INSERT INTO documents (
      id,
      original_name,
      stored_name,
      mime_type,
      size,
      document_type,
      status,
      extraction_status,
      uploaded_by,
      created_at,
      organisation_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    documentId,
    "cross-company-test.pdf",
    `${TEST_PREFIX}.synthetic`,
    "application/pdf",
    0,
    "Invoice",
    "Processed",
    "Completed",
    "E2E Isolation Test",
    timestamp,
    TEST_ORG
  );

  const invoiceId =
    randomUUID();

  db.prepare(`
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
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    invoiceId,
    documentId,
    `${TEST_PREFIX}-INV`,
    "30/09/2026",
    "30/10/2026",
    `${TEST_PREFIX} Supplier`,
    "cross-isolation@example.test",
    "CROSS-TEST-TAX",
    "INR",
    100,
    18,
    118,
    appaPO.po_number,
    100,
    "Validated",
    "Cross-company E2E invoice",
    timestamp,
    timestamp
  );

  db.prepare(`
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    invoiceId,
    "Cross Organisation Test Item",
    1,
    100,
    18,
    100,
    0,
    timestamp
  );

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
    "E2E_CROSS_ORG_TEST",
    "invoice",
    invoiceId,
    "Cross-company isolation marker",
    timestamp,
    TEST_ORG
  );

  db.prepare(`
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
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    "Cross Organisation E2E",
    "APPA Engine",
    "Completed",
    1,
    1,
    0,
    timestamp,
    timestamp,
    "Cross-company isolation marker",
    TEST_ORG
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM documents
      WHERE
        id = ?
        AND organisation_id = ?
    `).get(
      documentId,
      appa.id
    ).count === 0,
    "APPA cannot see Company B document through tenant predicate"
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM invoices i
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE
        i.id = ?
        AND d.organisation_id = ?
    `).get(
      invoiceId,
      appa.id
    ).count === 0,
    "APPA cannot see Company B invoice"
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM suppliers
      WHERE
        id = ?
        AND organisation_id = ?
    `).get(
      supplierId,
      appa.id
    ).count === 0,
    "APPA cannot see Company B supplier by known ID"
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM purchase_orders
      WHERE
        id = ?
        AND organisation_id = ?
    `).get(
      poId,
      appa.id
    ).count === 0,
    "APPA cannot see Company B PO by known ID"
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM audit_logs
      WHERE
        entity_id = ?
        AND organisation_id = ?
    `).get(
      invoiceId,
      appa.id
    ).count === 0,
    "APPA cannot see Company B audit marker"
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM automation_runs
      WHERE
        details = ?
        AND organisation_id = ?
    `).get(
      "Cross-company isolation marker",
      appa.id
    ).count === 0,
    "APPA cannot see Company B automation run"
  );

  let foreignMatchRejected =
    false;

  try {
    matchInvoice(
      invoiceId,
      appa.id
    );
  } catch (error) {
    foreignMatchRejected =
      /invoice not found/i.test(
        error.message
      );
  }

  assert(
    foreignMatchRejected,
    "APPA cannot match Company B invoice"
  );

  assert(
    getMatch(
      invoiceId,
      appa.id
    ) === null,
    "APPA cannot read Company B match"
  );

  const result =
    matchInvoice(
      invoiceId,
      TEST_ORG
    );

  assert(
    result,
    "Company B can run matching for its own invoice"
  );

  assert(
    result.purchaseOrderId === poId,
    "Company B matching uses Company B PO despite identical PO number"
  );

  assert(
    getMatch(
      invoiceId,
      appa.id
    ) === null,
    "Company B match remains hidden from APPA"
  );

  const appaDocument =
    db.prepare(`
      SELECT id
      FROM documents
      WHERE organisation_id = ?
      LIMIT 1
    `).get(
      appa.id
    );

  assert(
    appaDocument,
    "APPA document exists for reverse isolation test"
  );

  assert(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM documents
      WHERE
        id = ?
        AND organisation_id = ?
    `).get(
      appaDocument.id,
      TEST_ORG
    ).count === 0,
    "Company B cannot see APPA document"
  );

  const integrity =
    db.pragma(
      "integrity_check",
      { simple: true }
    );

  assert(
    integrity === "ok",
    "SQLite integrity remains healthy"
  );

  assert(
    db.pragma(
      "foreign_key_check"
    ).length === 0,
    "foreign keys remain clean"
  );
}

(async () => {
  try {
    await main();

    console.log("");
    console.log(
      "CROSS-COMPANY ISOLATION TEST PASSED"
    );
  } finally {
    cleanup();

    const remaining =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM organisations
        WHERE id = ?
      `).get(
        TEST_ORG
      ).count;

    if (remaining !== 0) {
      throw new Error(
        "Temporary organisation cleanup failed."
      );
    }

    console.log(
      "✓ Temporary Company B cleaned"
    );

    db.close();
  }
})().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
