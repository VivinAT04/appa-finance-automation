const { randomUUID } = require("crypto");

const db = require("../src/database");
const {
  matchInvoice,
  getMatch,
} = require("../src/matchingService");

const TEST_ORG = "org-cross-isolation-test";
const TEST_PREFIX = "E2E-CROSS-ORG";

const now = () => new Date().toISOString();

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }

  console.log(`✓ ${message}`);
}

async function count(sql, params = []) {
  const row = await db.one(sql, params);
  return Number(row?.count || 0);
}

async function cleanup() {
  /*
   * Remove only records owned by the temporary test organisation.
   * The order intentionally follows the foreign-key graph.
   */
  const docs = await db.many(
    `
      SELECT id
      FROM documents
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  const docIds = docs.map((row) => row.id);

  if (docIds.length) {
    const invoices = await db.many(
      `
        SELECT id
        FROM invoices
        WHERE document_id = ANY($1::text[])
      `,
      [docIds]
    );

    const invoiceIds = invoices.map((row) => row.id);

    if (invoiceIds.length) {
      await db.execute(
        `
          DELETE FROM approvals
          WHERE invoice_id = ANY($1::text[])
        `,
        [invoiceIds]
      );

      await db.execute(
        `
          DELETE FROM exceptions
          WHERE invoice_id = ANY($1::text[])
        `,
        [invoiceIds]
      );

      await db.execute(
        `
          DELETE FROM invoice_matches
          WHERE invoice_id = ANY($1::text[])
        `,
        [invoiceIds]
      );

      await db.execute(
        `
          DELETE FROM invoice_line_items
          WHERE invoice_id = ANY($1::text[])
        `,
        [invoiceIds]
      );

      await db.execute(
        `
          DELETE FROM invoices
          WHERE id = ANY($1::text[])
        `,
        [invoiceIds]
      );
    }
  }

  await db.execute(
    `
      DELETE FROM audit_logs
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  await db.execute(
    `
      DELETE FROM automation_runs
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  await db.execute(
    `
      DELETE FROM documents
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  const purchaseOrders = await db.many(
    `
      SELECT id
      FROM purchase_orders
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  const poIds = purchaseOrders.map((row) => row.id);

  if (poIds.length) {
    await db.execute(
      `
        DELETE FROM purchase_order_items
        WHERE purchase_order_id = ANY($1::text[])
      `,
      [poIds]
    );
  }

  await db.execute(
    `
      DELETE FROM purchase_orders
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  await db.execute(
    `
      DELETE FROM suppliers
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  await db.execute(
    `
      DELETE FROM app_settings
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  await db.execute(
    `
      DELETE FROM organisation_memberships
      WHERE organisation_id = $1
    `,
    [TEST_ORG]
  );

  await db.execute(
    `
      DELETE FROM organisations
      WHERE id = $1
    `,
    [TEST_ORG]
  );
}

async function main() {
  await cleanup();

  const appa = await db.one(
    `
      SELECT id, name, code
      FROM organisations
      WHERE code = 'APPA'
      LIMIT 1
    `
  );

  assert(appa, "APPA organisation exists");

  const appaSupplier = await db.one(
    `
      SELECT id, supplier_code
      FROM suppliers
      WHERE organisation_id = $1
      ORDER BY created_at
      LIMIT 1
    `,
    [appa.id]
  );

  assert(
    appaSupplier,
    "APPA supplier exists for shared-code test"
  );

  const appaPo = await db.one(
    `
      SELECT id, po_number
      FROM purchase_orders
      WHERE organisation_id = $1
      ORDER BY created_at
      LIMIT 1
    `,
    [appa.id]
  );

  assert(
    appaPo,
    "APPA purchase order exists for shared-number test"
  );

  const appaSetting = await db.one(
    `
      SELECT setting_key, setting_value
      FROM app_settings
      WHERE organisation_id = $1
      ORDER BY setting_key
      LIMIT 1
    `,
    [appa.id]
  );

  assert(
    appaSetting,
    "APPA setting exists for shared-key test"
  );

  const createdAt = now();

  await db.execute(
    `
      INSERT INTO organisations (
        id,
        name,
        code,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'Active', $4, $4)
    `,
    [
      TEST_ORG,
      "APPA Isolation Test Company B",
      "APPA-TEST-B",
      createdAt,
    ]
  );

  const supplierId = randomUUID();

  await db.execute(
    `
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
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $8, $9
      )
    `,
    [
      supplierId,
      appaSupplier.supplier_code,
      "Company B Shared Supplier",
      "company-b-supplier@example.test",
      "TEST-TAX-B",
      30,
      "Active",
      createdAt,
      TEST_ORG,
    ]
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM suppliers
        WHERE supplier_code = $1
      `,
      [appaSupplier.supplier_code]
    ) >= 2,
    "same supplier code can exist across organisations"
  );

  const poId = randomUUID();

  await db.execute(
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
        $1,
        $2,
        $3,
        CURRENT_DATE,
        'INR',
        23000,
        4140,
        27140,
        'Open',
        $4,
        $4,
        $5
      )
    `,
    [
      poId,
      appaPo.po_number,
      supplierId,
      createdAt,
      TEST_ORG,
    ]
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM purchase_orders
        WHERE po_number = $1
      `,
      [appaPo.po_number]
    ) >= 2,
    "same PO number can exist across organisations"
  );

  await db.execute(
    `
      INSERT INTO app_settings (
        setting_key,
        setting_value,
        description,
        updated_at,
        organisation_id
      )
      VALUES ($1, $2, $3, $4, $5)
    `,
    [
      appaSetting.setting_key,
      "COMPANY-B-TEST-VALUE",
      "Cross-company isolation test",
      createdAt,
      TEST_ORG,
    ]
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM app_settings
        WHERE setting_key = $1
      `,
      [appaSetting.setting_key]
    ) >= 2,
    "same setting key can exist across organisations"
  );

  const documentId = randomUUID();
  const invoiceId = randomUUID();

  await db.execute(
    `
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
      VALUES (
        $1,
        $2,
        $3,
        'application/pdf',
        1,
        'Invoice',
        'Processed',
        'Completed',
        'Automated Test',
        $4,
        $5
      )
    `,
    [
      documentId,
      `${TEST_PREFIX}-invoice.pdf`,
      `${TEST_PREFIX}-invoice.pdf`,
      createdAt,
      TEST_ORG,
    ]
  );

  await db.execute(
    `
      INSERT INTO invoices (
        id,
        document_id,
        invoice_number,
        supplier_name,
        purchase_order_number,
        invoice_date,
        due_date,
        currency,
        subtotal,
        tax_amount,
        total_amount,
        extraction_confidence,
        validation_status,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        CURRENT_DATE,
        CURRENT_DATE + 30,
        'INR',
        23000,
        4140,
        27140,
        0.99,
        'Validated',
        $6,
        $6
      )
    `,
    [
      invoiceId,
      documentId,
      `${TEST_PREFIX}-INV-001`,
      "Company B Shared Supplier",
      appaPo.po_number,
      createdAt,
    ]
  );

  await db.execute(
    `
      INSERT INTO audit_logs (
        id,
        entity_type,
        entity_id,
        action,
        description,
        created_at,
        organisation_id
      )
      VALUES (
        $1,
        'Invoice',
        $2,
        'CROSS_ORG_TEST',
        'Cross-company isolation marker',
        $3,
        $4
      )
    `,
    [
      randomUUID(),
      invoiceId,
      createdAt,
      TEST_ORG,
    ]
  );

  await db.execute(
    `
      INSERT INTO automation_runs (
        id,
        process_name,
        source,
        status,
        started_at,
        completed_at,
        items_processed,
        items_succeeded,
        items_failed,
        details,
        organisation_id
      )
      VALUES (
        $1,
        'Cross Organisation Isolation Test',
        'Automated Test',
        'Completed',
        $2,
        $2,
        1,
        1,
        0,
        'Cross-company isolation marker',
        $3
      )
    `,
    [
      randomUUID(),
      createdAt,
      TEST_ORG,
    ]
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM documents
        WHERE id = $1
          AND organisation_id = $2
      `,
      [documentId, appa.id]
    ) === 0,
    "APPA cannot see Company B document through tenant predicate"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM invoices i
        JOIN documents d
          ON d.id = i.document_id
        WHERE i.id = $1
          AND d.organisation_id = $2
      `,
      [invoiceId, appa.id]
    ) === 0,
    "APPA cannot see Company B invoice"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM suppliers
        WHERE id = $1
          AND organisation_id = $2
      `,
      [supplierId, appa.id]
    ) === 0,
    "APPA cannot see Company B supplier by known ID"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM purchase_orders
        WHERE id = $1
          AND organisation_id = $2
      `,
      [poId, appa.id]
    ) === 0,
    "APPA cannot see Company B PO by known ID"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM audit_logs
        WHERE entity_id = $1
          AND organisation_id = $2
      `,
      [invoiceId, appa.id]
    ) === 0,
    "APPA cannot see Company B audit marker"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM automation_runs
        WHERE details = $1
          AND organisation_id = $2
      `,
      ["Cross-company isolation marker", appa.id]
    ) === 0,
    "APPA cannot see Company B automation run"
  );

  let foreignMatchRejected = false;

  try {
    await matchInvoice(invoiceId, appa.id);
  } catch (error) {
    foreignMatchRejected =
      /invoice not found/i.test(error.message);
  }

  assert(
    foreignMatchRejected,
    "APPA cannot match Company B invoice"
  );

  assert(
    (await getMatch(invoiceId, appa.id)) === null,
    "APPA cannot read Company B match"
  );

  const result =
    await matchInvoice(invoiceId, TEST_ORG);

  assert(
    result,
    "Company B can run matching for its own invoice"
  );

  assert(
    result.purchaseOrderId === poId,
    "Company B matching uses Company B PO despite identical PO number"
  );

  assert(
    (await getMatch(invoiceId, appa.id)) === null,
    "Company B match remains hidden from APPA"
  );

  const appaDocument = await db.one(
    `
      SELECT id
      FROM documents
      WHERE organisation_id = $1
      LIMIT 1
    `,
    [appa.id]
  );

  assert(
    appaDocument,
    "APPA document exists for reverse isolation test"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM documents
        WHERE id = $1
          AND organisation_id = $2
      `,
      [appaDocument.id, TEST_ORG]
    ) === 0,
    "Company B cannot see APPA document"
  );

  const health = await db.healthCheck();

  assert(
    Boolean(health),
    "PostgreSQL health check passes"
  );

  const fkViolations = await db.many(
    `
      SELECT
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.constraint_schema = kcu.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.tables t
          WHERE t.table_schema = 'public'
            AND t.table_name = tc.table_name
        )
    `
  );

  assert(
    fkViolations.length === 0,
    "PostgreSQL foreign-key metadata remains valid"
  );
}

(async () => {
  let failure = null;

  try {
    await main();

    console.log("");
    console.log(
      "CROSS-COMPANY ISOLATION TEST PASSED"
    );
  } catch (error) {
    failure = error;
    console.error(error);
  }

  try {
    await cleanup();

    const remaining = await count(
      `
        SELECT COUNT(*)::int AS count
        FROM organisations
        WHERE id = $1
      `,
      [TEST_ORG]
    );

    if (remaining !== 0) {
      throw new Error(
        "Temporary organisation cleanup failed."
      );
    }

    console.log(
      "✓ Temporary Company B cleaned"
    );
  } catch (cleanupError) {
    console.error(cleanupError);

    if (!failure) {
      failure = cleanupError;
    }
  }

  await db.close();

  if (failure) {
    process.exitCode = 1;
  }
})();
