const { randomUUID } = require("crypto");
const db = require("./database");
const { matchInvoice } = require("./matchingService");

const SCENARIO_PREFIX = "APPA-SCN-";

function now() {
  return new Date().toISOString();
}

function audit(action, entityType, entityId, description) {
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
    now()
  );
}

function ensureSupplier() {
  const supplierCode = `${SCENARIO_PREFIX}SUPPLIER`;

  let supplier = db.prepare(`
    SELECT *
    FROM suppliers
    WHERE supplier_code = ?
  `).get(supplierCode);

  if (supplier) {
    return supplier;
  }

  const id = randomUUID();
  const timestamp = now();

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
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    supplierCode,
    "APPA Scenario Supplies Ltd",
    "scenario-supplier@example.test",
    "GST-APPA-SCENARIO",
    30,
    "Active",
    timestamp,
    timestamp
  );

  return db.prepare(`
    SELECT *
    FROM suppliers
    WHERE id = ?
  `).get(id);
}

function ensurePurchaseOrder(supplier) {
  const poNumber = `${SCENARIO_PREFIX}PO-1001`;

  let purchaseOrder = db.prepare(`
    SELECT *
    FROM purchase_orders
    WHERE po_number = ?
  `).get(poNumber);

  if (purchaseOrder) {
    return purchaseOrder;
  }

  const poId = randomUUID();
  const timestamp = now();

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
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    poId,
    poNumber,
    supplier.id,
    "2026-09-29",
    "INR",
    23000,
    4140,
    27140,
    "Open",
    timestamp,
    timestamp
  );

  const insertLine = db.prepare(`
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
  `);

  const lines = [
    {
      description: "Office Chairs",
      quantity: 4,
      unitPrice: 4500,
      taxRate: 18,
      lineTotal: 18000,
    },
    {
      description: "Printer Paper",
      quantity: 10,
      unitPrice: 300,
      taxRate: 18,
      lineTotal: 3000,
    },
    {
      description: "File Storage Boxes",
      quantity: 5,
      unitPrice: 400,
      taxRate: 18,
      lineTotal: 2000,
    },
  ];

  lines.forEach((line, index) => {
    insertLine.run(
      randomUUID(),
      poId,
      line.description,
      line.quantity,
      line.unitPrice,
      line.lineTotal,
      index,
      timestamp
    );
  });

  return db.prepare(`
    SELECT *
    FROM purchase_orders
    WHERE id = ?
  `).get(poId);
}

function createDocument({
  scenario,
  filename,
}) {
  const id = randomUUID();
  const timestamp = now();

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
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    filename,
    `${SCENARIO_PREFIX}${scenario}.synthetic`,
    "application/pdf",
    0,
    "Invoice",
    "Processed",
    "Completed",
    "Scenario Runner",
    timestamp
  );

  return id;
}

function createInvoice({
  scenario,
  invoiceNumber,
  supplier,
  poNumber,
  subtotal,
  taxAmount,
  totalAmount,
  lines,
}) {
  const existing = db.prepare(`
    SELECT id
    FROM invoices
    WHERE document_id IN (
      SELECT id
      FROM documents
      WHERE stored_name = ?
    )
  `).get(
    `${SCENARIO_PREFIX}${scenario}.synthetic`
  );

  if (existing) {
    return existing.id;
  }

  const documentId = createDocument({
    scenario,
    filename:
      `${scenario.toLowerCase().replaceAll("_", "-")}.pdf`,
  });

  const invoiceId = randomUUID();
  const timestamp = now();

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
    invoiceNumber,
    "29/09/2026",
    "29/10/2026",
    supplier.name,
    supplier.email,
    supplier.tax_id,
    "INR",
    subtotal,
    taxAmount,
    totalAmount,
    poNumber,
    100,
    "Validated",
    `Synthetic APPA scenario: ${scenario}`,
    timestamp,
    timestamp
  );

  const insertLine = db.prepare(`
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
  `);

  lines.forEach((line, index) => {
    insertLine.run(
      randomUUID(),
      invoiceId,
      line.description,
      line.quantity,
      line.unitPrice,
      line.taxRate,
      line.lineTotal,
      index,
      timestamp
    );
  });

  audit(
    "SCENARIO_INVOICE_CREATED",
    "invoice",
    invoiceId,
    `Synthetic scenario ${scenario} created`
  );

  return invoiceId;
}

function baseLines() {
  return [
    {
      description: "Office Chairs",
      quantity: 4,
      unitPrice: 4500,
      taxRate: 18,
      lineTotal: 18000,
    },
    {
      description: "Printer Paper",
      quantity: 10,
      unitPrice: 300,
      taxRate: 18,
      lineTotal: 3000,
    },
    {
      description: "File Storage Boxes",
      quantity: 5,
      unitPrice: 400,
      taxRate: 18,
      lineTotal: 2000,
    },
  ];
}

function seedScenarios() {
  const supplier = ensureSupplier();
  const purchaseOrder =
    ensurePurchaseOrder(supplier);

  const cleanInvoiceId = createInvoice({
    scenario: "CLEAN_MATCH",
    invoiceNumber: `${SCENARIO_PREFIX}INV-CLEAN-001`,
    supplier,
    poNumber: purchaseOrder.po_number,
    subtotal: 23000,
    taxAmount: 4140,
    totalAmount: 27140,
    lines: baseLines(),
  });

  const mismatchLines = baseLines();

  mismatchLines[0] = {
    ...mismatchLines[0],
    unitPrice: 5000,
    lineTotal: 20000,
  };

  const mismatchInvoiceId = createInvoice({
    scenario: "AMOUNT_MISMATCH",
    invoiceNumber:
      `${SCENARIO_PREFIX}INV-MISMATCH-001`,
    supplier,
    poNumber: purchaseOrder.po_number,
    subtotal: 25000,
    taxAmount: 4500,
    totalAmount: 29500,
    lines: mismatchLines,
  });

  const missingPOInvoiceId = createInvoice({
    scenario: "MISSING_PO",
    invoiceNumber:
      `${SCENARIO_PREFIX}INV-MISSING-PO-001`,
    supplier,
    poNumber: "",
    subtotal: 23000,
    taxAmount: 4140,
    totalAmount: 27140,
    lines: baseLines(),
  });

  /*
   * Duplicate scenario:
   *
   * This deliberately reuses the clean invoice's
   * invoice number, supplier and total amount while
   * remaining a separate invoice/document record.
   */
  const duplicateInvoiceId = createInvoice({
    scenario: "DUPLICATE_INVOICE",
    invoiceNumber:
      `${SCENARIO_PREFIX}INV-CLEAN-001`,
    supplier,
    poNumber: purchaseOrder.po_number,
    subtotal: 23000,
    taxAmount: 4140,
    totalAmount: 27140,
    lines: baseLines(),
  });

  audit(
    "SCENARIO_DATA_SEEDED",
    "system",
    "APPA_WORKFLOW_SCENARIOS",
    "Synthetic AP workflow scenarios prepared"
  );

  return {
    supplierId: supplier.id,
    purchaseOrderId: purchaseOrder.id,

    scenarios: {
      cleanMatch: {
        invoiceId: cleanInvoiceId,
        expected: "Matched",
      },

      amountMismatch: {
        invoiceId: mismatchInvoiceId,
        expected: "Exception",
      },

      missingPO: {
        invoiceId: missingPOInvoiceId,
        expected: "Exception",
      },

      duplicateInvoice: {
        invoiceId: duplicateInvoiceId,
        expected: "Exception",
      },
    },
  };
}

function getScenarioInvoices() {
  return db.prepare(`
    SELECT
      i.id,
      i.invoice_number AS invoiceNumber,
      i.supplier_name AS supplierName,
      i.currency,
      i.subtotal,
      i.tax_amount AS taxAmount,
      i.total_amount AS totalAmount,
      i.purchase_order_number AS purchaseOrderNumber,
      i.validation_status AS validationStatus,
      i.validation_message AS validationMessage,
      i.created_at AS createdAt,

      d.stored_name AS storedName,

      im.match_status AS matchStatus,
      im.match_score AS matchScore,

      (
        SELECT COUNT(*)
        FROM exceptions e
        WHERE e.invoice_id = i.id
          AND e.status = 'Open'
      ) AS openExceptions,

      (
        SELECT a.decision
        FROM approvals a
        WHERE a.invoice_id = i.id
        ORDER BY a.created_at DESC
        LIMIT 1
      ) AS latestDecision

    FROM invoices i

    JOIN documents d
      ON d.id = i.document_id

    LEFT JOIN invoice_matches im
      ON im.invoice_id = i.id

    WHERE d.stored_name LIKE ?

    ORDER BY i.created_at ASC
  `).all(`${SCENARIO_PREFIX}%`);
}

function getScenarioResults() {
  const invoices = getScenarioInvoices();

  return invoices.map((invoice) => {
    const marker =
      invoice.validationMessage || "";

    const scenario =
      marker.replace(
        "Synthetic APPA scenario: ",
        ""
      );

    let expected = "Exception";

    if (scenario === "CLEAN_MATCH") {
      expected = "Matched";
    }

    const actual =
      invoice.matchStatus || "Not Run";

    let passed = false;

    if (expected === "Matched") {
      passed =
        actual === "Matched" &&
        invoice.latestDecision === "Approved" &&
        Number(invoice.openExceptions) === 0;
    } else {
      passed =
        actual === "Exception" &&
        Number(invoice.openExceptions) > 0;
    }

    return {
      scenario,
      invoiceId: invoice.id,
      invoiceNumber:
        invoice.invoiceNumber,
      expected,
      actual,
      matchScore:
        invoice.matchScore,
      openExceptions:
        Number(
          invoice.openExceptions || 0
        ),
      approval:
        invoice.latestDecision || null,
      passed,
    };
  });
}

function removeScenarioData() {
  const docs = db.prepare(`
    SELECT id
    FROM documents
    WHERE stored_name LIKE ?
  `).all(`${SCENARIO_PREFIX}%`);

  const documentIds =
    docs.map((row) => row.id);

  const invoiceRows =
    documentIds.length
      ? db.prepare(`
          SELECT id
          FROM invoices
          WHERE document_id IN (
            ${documentIds.map(() => "?").join(",")}
          )
        `).all(...documentIds)
      : [];

  const invoiceIds =
    invoiceRows.map((row) => row.id);

  const transaction = db.transaction(() => {
    if (invoiceIds.length) {
      const placeholders =
        invoiceIds
          .map(() => "?")
          .join(",");

      db.prepare(`
        DELETE FROM approvals
        WHERE invoice_id IN (${placeholders})
      `).run(...invoiceIds);

      db.prepare(`
        DELETE FROM exceptions
        WHERE invoice_id IN (${placeholders})
      `).run(...invoiceIds);

      db.prepare(`
        DELETE FROM invoice_matches
        WHERE invoice_id IN (${placeholders})
      `).run(...invoiceIds);

      db.prepare(`
        DELETE FROM invoice_line_items
        WHERE invoice_id IN (${placeholders})
      `).run(...invoiceIds);

      db.prepare(`
        DELETE FROM invoices
        WHERE id IN (${placeholders})
      `).run(...invoiceIds);
    }

    if (documentIds.length) {
      const placeholders =
        documentIds
          .map(() => "?")
          .join(",");

      db.prepare(`
        DELETE FROM documents
        WHERE id IN (${placeholders})
      `).run(...documentIds);
    }

    const poRows = db.prepare(`
      SELECT id
      FROM purchase_orders
      WHERE po_number LIKE ?
    `).all(`${SCENARIO_PREFIX}%`);

    const poIds =
      poRows.map((row) => row.id);

    if (poIds.length) {
      const placeholders =
        poIds
          .map(() => "?")
          .join(",");

      db.prepare(`
        DELETE FROM purchase_order_items
        WHERE purchase_order_id IN (${placeholders})
      `).run(...poIds);

      db.prepare(`
        DELETE FROM purchase_orders
        WHERE id IN (${placeholders})
      `).run(...poIds);
    }

    db.prepare(`
      DELETE FROM suppliers
      WHERE supplier_code LIKE ?
    `).run(`${SCENARIO_PREFIX}%`);

    db.prepare(`
      DELETE FROM audit_logs
      WHERE action LIKE 'SCENARIO_%'
    `).run();
  });

  transaction();

  return {
    documentsRemoved:
      documentIds.length,

    invoicesRemoved:
      invoiceIds.length,
  };
}


async function runScenarios() {
  /*
   * Reset only APPA-SCN-* synthetic scenario data.
   *
   * Duplicate sequencing is intentional:
   *
   * 1. Create all synthetic fixtures.
   * 2. Temporarily remove the duplicate invoice.
   * 3. Process CLEAN_MATCH first.
   * 4. Process normal exception scenarios.
   * 5. Re-create DUPLICATE_INVOICE only after the clean
   *    invoice has completed successfully.
   *
   * This models the real business sequence: an original
   * invoice arrives first, then a duplicate arrives later.
   */

  removeScenarioData();

  const seeded = seedScenarios();

  const duplicateSeedId =
    seeded.scenarios.duplicateInvoice.invoiceId;

  /*
   * Remove only the pre-created duplicate fixture before
   * matching the original invoice.
   */
  const duplicateDocument = db.prepare(`
    SELECT
      i.document_id AS documentId
    FROM invoices i
    WHERE i.id = ?
  `).get(duplicateSeedId);

  if (duplicateSeedId) {
    db.prepare(`
      DELETE FROM approvals
      WHERE invoice_id = ?
    `).run(duplicateSeedId);

    db.prepare(`
      DELETE FROM exceptions
      WHERE invoice_id = ?
    `).run(duplicateSeedId);

    db.prepare(`
      DELETE FROM invoice_matches
      WHERE invoice_id = ?
    `).run(duplicateSeedId);

    db.prepare(`
      DELETE FROM invoice_line_items
      WHERE invoice_id = ?
    `).run(duplicateSeedId);

    db.prepare(`
      DELETE FROM invoices
      WHERE id = ?
    `).run(duplicateSeedId);
  }

  if (duplicateDocument?.documentId) {
    db.prepare(`
      DELETE FROM documents
      WHERE id = ?
    `).run(
      duplicateDocument.documentId
    );
  }

  const executions = [];

  async function execute(name, invoiceId) {
    try {
      const result =
        await Promise.resolve(
          matchInvoice(invoiceId)
        );

      executions.push({
        scenario: name,
        invoiceId,
        executed: true,
        result:
          result?.matchStatus ||
          result?.match_status ||
          result?.status ||
          null,
        error: null,
      });

      return result;
    } catch (error) {
      executions.push({
        scenario: name,
        invoiceId,
        executed: false,
        result: null,
        error: error.message,
      });

      return null;
    }
  }

  /*
   * Original invoice arrives first.
   */
  await execute(
    "CLEAN_MATCH",
    seeded.scenarios.cleanMatch.invoiceId
  );

  /*
   * Independent business exception cases.
   */
  await execute(
    "AMOUNT_MISMATCH",
    seeded.scenarios.amountMismatch.invoiceId
  );

  await execute(
    "MISSING_PO",
    seeded.scenarios.missingPO.invoiceId
  );

  /*
   * Duplicate arrives AFTER the original invoice.
   */
  const supplier = db.prepare(`
    SELECT *
    FROM suppliers
    WHERE supplier_code = ?
  `).get(
    `${SCENARIO_PREFIX}SUPPLIER`
  );

  const purchaseOrder = db.prepare(`
    SELECT *
    FROM purchase_orders
    WHERE po_number = ?
  `).get(
    `${SCENARIO_PREFIX}PO-1001`
  );

  if (!supplier || !purchaseOrder) {
    throw new Error(
      "Scenario supplier or purchase order missing before duplicate test"
    );
  }

  const duplicateInvoiceId =
    createInvoice({
      scenario: "DUPLICATE_INVOICE",
      invoiceNumber:
        `${SCENARIO_PREFIX}INV-CLEAN-001`,
      supplier,
      poNumber:
        purchaseOrder.po_number,
      subtotal: 23000,
      taxAmount: 4140,
      totalAmount: 27140,
      lines: baseLines(),
    });

  await execute(
    "DUPLICATE_INVOICE",
    duplicateInvoiceId
  );

  const results =
    getScenarioResults();

  const passed =
    results.filter(
      (item) => item.passed
    ).length;

  const summary = {
    total: results.length,
    passed,
    failed:
      results.length - passed,
    allPassed:
      results.length === 4 &&
      passed === 4,
  };

  audit(
    "SCENARIO_TEST_RUN",
    "system",
    "APPA_WORKFLOW_SCENARIOS",
    `Synthetic AP workflow test completed: ${passed}/${results.length} passed`
  );

  return {
    executionOrder: executions,
    summary,
    results,
  };
}


module.exports = {
  runScenarios,
  seedScenarios,
  getScenarioInvoices,
  getScenarioResults,
  removeScenarioData,
};
