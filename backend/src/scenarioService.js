const {
  randomUUID,
} = require("crypto");

const db =
  require("./database");

const {
  matchInvoice,
} = require("./matchingService");

const SCENARIO_PREFIX =
  "APPA-SCN-";

function now() {
  return new Date().toISOString();
}

function requireOrganisationId(
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required for synthetic workflow scenarios."
    );
  }

  const organisation =
    db.prepare(`
      SELECT
        id,
        name,
        code,
        status
      FROM organisations
      WHERE
        id = ?
        AND status = 'Active'
    `).get(
      organisationId
    );

  if (!organisation) {
    const error =
      new Error(
        "Active organisation not found for synthetic workflow scenarios."
      );

    error.status = 404;
    error.code =
      "ORGANISATION_NOT_FOUND";

    throw error;
  }

  return organisation;
}

function audit(
  organisationId,
  action,
  entityType,
  entityId,
  description
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required for scenario audit events."
    );
  }

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
    now(),
    organisationId
  );
}

function ensureSupplier(
  organisationId
) {
  requireOrganisationId(
    organisationId
  );

  const supplierCode =
    `${SCENARIO_PREFIX}SUPPLIER`;

  let supplier =
    db.prepare(`
      SELECT *
      FROM suppliers
      WHERE
        supplier_code = ?
        AND organisation_id = ?
    `).get(
      supplierCode,
      organisationId
    );

  if (supplier) {
    return supplier;
  }


  const id =
    randomUUID();

  const timestamp =
    now();

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
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    id,
    supplierCode,
    "APPA Scenario Supplies Ltd",
    "scenario-supplier@example.test",
    "GST-APPA-SCENARIO",
    30,
    "Active",
    timestamp,
    timestamp,
    organisationId
  );

  return db.prepare(`
    SELECT *
    FROM suppliers
    WHERE
      id = ?
      AND organisation_id = ?
  `).get(
    id,
    organisationId
  );
}

function ensurePurchaseOrder(
  supplier,
  organisationId
) {
  requireOrganisationId(
    organisationId
  );

  if (
    !supplier ||
    supplier.organisation_id !==
      organisationId
  ) {
    throw new Error(
      "Scenario supplier does not belong to the selected organisation."
    );
  }

  const poNumber =
    `${SCENARIO_PREFIX}PO-1001`;

  let purchaseOrder =
    db.prepare(`
      SELECT po.*
      FROM purchase_orders po

      INNER JOIN suppliers s
        ON s.id = po.supplier_id

      WHERE
        po.po_number = ?
        AND po.organisation_id = ?
        AND s.organisation_id = ?
    `).get(
      poNumber,
      organisationId,
      organisationId
    );

  if (purchaseOrder) {
    return purchaseOrder;
  }


  const poId =
    randomUUID();

  const timestamp =
    now();

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
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
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
    timestamp,
    organisationId
  );

  const insertLine =
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
    `);

  const lines = [
    {
      description:
        "Office Chairs",
      quantity: 4,
      unitPrice: 4500,
      taxRate: 18,
      lineTotal: 18000,
    },
    {
      description:
        "Printer Paper",
      quantity: 10,
      unitPrice: 300,
      taxRate: 18,
      lineTotal: 3000,
    },
    {
      description:
        "File Storage Boxes",
      quantity: 5,
      unitPrice: 400,
      taxRate: 18,
      lineTotal: 2000,
    },
  ];

  lines.forEach(
    (line, index) => {
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
    }
  );

  return db.prepare(`
    SELECT *
    FROM purchase_orders
    WHERE
      id = ?
      AND organisation_id = ?
  `).get(
    poId,
    organisationId
  );
}

function createDocument({
  organisationId,
  scenario,
  filename,
}) {
  requireOrganisationId(
    organisationId
  );

  const id =
    randomUUID();

  const timestamp =
    now();

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
    VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
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
    timestamp,
    organisationId
  );

  return id;
}

function createInvoice({
  organisationId,
  scenario,
  invoiceNumber,
  supplier,
  poNumber,
  subtotal,
  taxAmount,
  totalAmount,
  lines,
}) {
  requireOrganisationId(
    organisationId
  );

  if (
    !supplier ||
    supplier.organisation_id !==
      organisationId
  ) {
    throw new Error(
      "Scenario invoice supplier does not belong to the selected organisation."
    );
  }

  const storedName =
    `${SCENARIO_PREFIX}${scenario}.synthetic`;

  const existing =
    db.prepare(`
      SELECT i.id

      FROM invoices i

      INNER JOIN documents d
        ON d.id = i.document_id

      WHERE
        d.stored_name = ?
        AND d.organisation_id = ?
    `).get(
      storedName,
      organisationId
    );

  if (existing) {
    return existing.id;
  }

  const documentId =
    createDocument({
      organisationId,
      scenario,
      filename:
        `${scenario
          .toLowerCase()
          .replaceAll("_", "-")}.pdf`,
    });

  const invoiceId =
    randomUUID();

  const timestamp =
    now();

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

  const insertLine =
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
    `);

  lines.forEach(
    (line, index) => {
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
    }
  );

  audit(
    organisationId,
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
      description:
        "Office Chairs",
      quantity: 4,
      unitPrice: 4500,
      taxRate: 18,
      lineTotal: 18000,
    },
    {
      description:
        "Printer Paper",
      quantity: 10,
      unitPrice: 300,
      taxRate: 18,
      lineTotal: 3000,
    },
    {
      description:
        "File Storage Boxes",
      quantity: 5,
      unitPrice: 400,
      taxRate: 18,
      lineTotal: 2000,
    },
  ];
}

function seedScenarios(
  organisationId
) {
  requireOrganisationId(
    organisationId
  );

  const supplier =
    ensureSupplier(
      organisationId
    );

  const purchaseOrder =
    ensurePurchaseOrder(
      supplier,
      organisationId
    );

  const cleanInvoiceId =
    createInvoice({
      organisationId,
      scenario:
        "CLEAN_MATCH",
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

  const mismatchLines =
    baseLines();

  mismatchLines[0] = {
    ...mismatchLines[0],
    unitPrice: 5000,
    lineTotal: 20000,
  };

  const mismatchInvoiceId =
    createInvoice({
      organisationId,
      scenario:
        "AMOUNT_MISMATCH",
      invoiceNumber:
        `${SCENARIO_PREFIX}INV-MISMATCH-001`,
      supplier,
      poNumber:
        purchaseOrder.po_number,
      subtotal: 25000,
      taxAmount: 4500,
      totalAmount: 29500,
      lines: mismatchLines,
    });

  const missingPOInvoiceId =
    createInvoice({
      organisationId,
      scenario:
        "MISSING_PO",
      invoiceNumber:
        `${SCENARIO_PREFIX}INV-MISSING-PO-001`,
      supplier,
      poNumber: "",
      subtotal: 23000,
      taxAmount: 4140,
      totalAmount: 27140,
      lines: baseLines(),
    });

  const duplicateInvoiceId =
    createInvoice({
      organisationId,
      scenario:
        "DUPLICATE_INVOICE",
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

  audit(
    organisationId,
    "SCENARIO_DATA_SEEDED",
    "system",
    "APPA_WORKFLOW_SCENARIOS",
    "Synthetic AP workflow scenarios prepared"
  );

  return {
    supplierId:
      supplier.id,

    purchaseOrderId:
      purchaseOrder.id,

    scenarios: {
      cleanMatch: {
        invoiceId:
          cleanInvoiceId,
        expected:
          "Matched",
      },

      amountMismatch: {
        invoiceId:
          mismatchInvoiceId,
        expected:
          "Exception",
      },

      missingPO: {
        invoiceId:
          missingPOInvoiceId,
        expected:
          "Exception",
      },

      duplicateInvoice: {
        invoiceId:
          duplicateInvoiceId,
        expected:
          "Exception",
      },
    },
  };
}

function getScenarioInvoices(
  organisationId
) {
  requireOrganisationId(
    organisationId
  );

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
        WHERE
          e.invoice_id = i.id
          AND e.status = 'Open'
      ) AS openExceptions,

      (
        SELECT a.decision
        FROM approvals a
        WHERE
          a.invoice_id = i.id
        ORDER BY
          a.created_at DESC
        LIMIT 1
      ) AS latestDecision

    FROM invoices i

    INNER JOIN documents d
      ON d.id = i.document_id

    LEFT JOIN invoice_matches im
      ON im.invoice_id = i.id

    WHERE
      d.stored_name LIKE ?
      AND d.organisation_id = ?

    ORDER BY
      i.created_at ASC
  `).all(
    `${SCENARIO_PREFIX}%`,
    organisationId
  );
}

function getScenarioResults(
  organisationId
) {
  const invoices =
    getScenarioInvoices(
      organisationId
    );

  return invoices.map(
    (invoice) => {
      const marker =
        invoice.validationMessage ||
        "";

      const scenario =
        marker.replace(
          "Synthetic APPA scenario: ",
          ""
        );

      let expected =
        "Exception";

      if (
        scenario ===
        "CLEAN_MATCH"
      ) {
        expected =
          "Matched";
      }

      const actual =
        invoice.matchStatus ||
        "Not Run";

      let passed = false;

      if (
        expected ===
        "Matched"
      ) {
        passed =
          actual === "Matched" &&
          invoice.latestDecision ===
            "Approved" &&
          Number(
            invoice.openExceptions
          ) === 0;
      } else {
        passed =
          actual ===
            "Exception" &&
          Number(
            invoice.openExceptions
          ) > 0;
      }

      return {
        scenario,
        invoiceId:
          invoice.id,
        invoiceNumber:
          invoice.invoiceNumber,
        expected,
        actual,
        matchScore:
          invoice.matchScore,
        openExceptions:
          Number(
            invoice.openExceptions ||
            0
          ),
        approval:
          invoice.latestDecision ||
          null,
        passed,
      };
    }
  );
}

function removeScenarioData(
  organisationId
) {
  requireOrganisationId(
    organisationId
  );

  const docs =
    db.prepare(`
      SELECT id
      FROM documents
      WHERE
        stored_name LIKE ?
        AND organisation_id = ?
    `).all(
      `${SCENARIO_PREFIX}%`,
      organisationId
    );

  const documentIds =
    docs.map(
      (row) => row.id
    );

  const invoiceRows =
    documentIds.length
      ? db.prepare(`
          SELECT i.id

          FROM invoices i

          INNER JOIN documents d
            ON d.id =
               i.document_id

          WHERE
            i.document_id IN (
              ${documentIds
                .map(() => "?")
                .join(",")}
            )

            AND d.organisation_id = ?
        `).all(
          ...documentIds,
          organisationId
        )
      : [];

  const invoiceIds =
    invoiceRows.map(
      (row) => row.id
    );

  const transaction =
    db.transaction(() => {
      if (
        invoiceIds.length
      ) {
        const placeholders =
          invoiceIds
            .map(() => "?")
            .join(",");

        db.prepare(`
          DELETE FROM approvals
          WHERE
            invoice_id IN (
              ${placeholders}
            )
            AND invoice_id IN (
              SELECT i.id
              FROM invoices i
              INNER JOIN documents d
                ON d.id =
                   i.document_id
              WHERE
                d.organisation_id = ?
            )
        `).run(
          ...invoiceIds,
          organisationId
        );

        db.prepare(`
          DELETE FROM exceptions
          WHERE
            invoice_id IN (
              ${placeholders}
            )
            AND invoice_id IN (
              SELECT i.id
              FROM invoices i
              INNER JOIN documents d
                ON d.id =
                   i.document_id
              WHERE
                d.organisation_id = ?
            )
        `).run(
          ...invoiceIds,
          organisationId
        );

        db.prepare(`
          DELETE FROM invoice_matches
          WHERE
            invoice_id IN (
              ${placeholders}
            )
            AND invoice_id IN (
              SELECT i.id
              FROM invoices i
              INNER JOIN documents d
                ON d.id =
                   i.document_id
              WHERE
                d.organisation_id = ?
            )
        `).run(
          ...invoiceIds,
          organisationId
        );

        db.prepare(`
          DELETE FROM invoice_line_items
          WHERE
            invoice_id IN (
              ${placeholders}
            )
            AND invoice_id IN (
              SELECT i.id
              FROM invoices i
              INNER JOIN documents d
                ON d.id =
                   i.document_id
              WHERE
                d.organisation_id = ?
            )
        `).run(
          ...invoiceIds,
          organisationId
        );

        db.prepare(`
          DELETE FROM invoices
          WHERE
            id IN (
              ${placeholders}
            )
            AND document_id IN (
              SELECT id
              FROM documents
              WHERE organisation_id = ?
            )
        `).run(
          ...invoiceIds,
          organisationId
        );
      }

      if (
        documentIds.length
      ) {
        const placeholders =
          documentIds
            .map(() => "?")
            .join(",");

        db.prepare(`
          DELETE FROM documents
          WHERE
            id IN (
              ${placeholders}
            )
            AND organisation_id = ?
        `).run(
          ...documentIds,
          organisationId
        );
      }

      const poRows =
        db.prepare(`
          SELECT id
          FROM purchase_orders
          WHERE
            po_number LIKE ?
            AND organisation_id = ?
        `).all(
          `${SCENARIO_PREFIX}%`,
          organisationId
        );

      const poIds =
        poRows.map(
          (row) => row.id
        );

      if (
        poIds.length
      ) {
        const placeholders =
          poIds
            .map(() => "?")
            .join(",");

        db.prepare(`
          DELETE FROM purchase_order_items
          WHERE
            purchase_order_id IN (
              ${placeholders}
            )
            AND purchase_order_id IN (
              SELECT id
              FROM purchase_orders
              WHERE organisation_id = ?
            )
        `).run(
          ...poIds,
          organisationId
        );

        db.prepare(`
          DELETE FROM purchase_orders
          WHERE
            id IN (
              ${placeholders}
            )
            AND organisation_id = ?
        `).run(
          ...poIds,
          organisationId
        );
      }

      db.prepare(`
        DELETE FROM suppliers
        WHERE
          supplier_code LIKE ?
          AND organisation_id = ?
      `).run(
        `${SCENARIO_PREFIX}%`,
        organisationId
      );

      db.prepare(`
        DELETE FROM audit_logs
        WHERE
          action LIKE 'SCENARIO_%'
          AND organisation_id = ?
      `).run(
        organisationId
      );
    });

  transaction();

  return {
    documentsRemoved:
      documentIds.length,

    invoicesRemoved:
      invoiceIds.length,
  };
}

async function runScenarios(
  organisationId
) {
  requireOrganisationId(
    organisationId
  );

  /*
   * Reset only the selected organisation's
   * APPA-SCN-* synthetic scenario data.
   */
  removeScenarioData(
    organisationId
  );

  const seeded =
    seedScenarios(
      organisationId
    );

  const duplicateSeedId =
    seeded.scenarios
      .duplicateInvoice
      .invoiceId;

  const duplicateDocument =
    db.prepare(`
      SELECT
        i.document_id AS documentId

      FROM invoices i

      INNER JOIN documents d
        ON d.id =
           i.document_id

      WHERE
        i.id = ?
        AND d.organisation_id = ?
    `).get(
      duplicateSeedId,
      organisationId
    );

  if (
    duplicateSeedId &&
    duplicateDocument
  ) {
    db.prepare(`
      DELETE FROM approvals
      WHERE
        invoice_id = ?
        AND invoice_id IN (
          SELECT i.id
          FROM invoices i
          INNER JOIN documents d
            ON d.id =
               i.document_id
          WHERE
            d.organisation_id = ?
        )
    `).run(
      duplicateSeedId,
      organisationId
    );

    db.prepare(`
      DELETE FROM exceptions
      WHERE
        invoice_id = ?
        AND invoice_id IN (
          SELECT i.id
          FROM invoices i
          INNER JOIN documents d
            ON d.id =
               i.document_id
          WHERE
            d.organisation_id = ?
        )
    `).run(
      duplicateSeedId,
      organisationId
    );

    db.prepare(`
      DELETE FROM invoice_matches
      WHERE
        invoice_id = ?
        AND invoice_id IN (
          SELECT i.id
          FROM invoices i
          INNER JOIN documents d
            ON d.id =
               i.document_id
          WHERE
            d.organisation_id = ?
        )
    `).run(
      duplicateSeedId,
      organisationId
    );

    db.prepare(`
      DELETE FROM invoice_line_items
      WHERE
        invoice_id = ?
        AND invoice_id IN (
          SELECT i.id
          FROM invoices i
          INNER JOIN documents d
            ON d.id =
               i.document_id
          WHERE
            d.organisation_id = ?
        )
    `).run(
      duplicateSeedId,
      organisationId
    );

    db.prepare(`
      DELETE FROM invoices
      WHERE
        id = ?
        AND document_id IN (
          SELECT id
          FROM documents
          WHERE organisation_id = ?
        )
    `).run(
      duplicateSeedId,
      organisationId
    );

    db.prepare(`
      DELETE FROM documents
      WHERE
        id = ?
        AND organisation_id = ?
    `).run(
      duplicateDocument
        .documentId,
      organisationId
    );
  }

  const executions = [];

  async function execute(
    name,
    invoiceId
  ) {
    try {
      const result =
        await Promise.resolve(
          matchInvoice(
            invoiceId,
            organisationId
          )
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
        error:
          error.message,
      });

      return null;
    }
  }

  await execute(
    "CLEAN_MATCH",
    seeded.scenarios
      .cleanMatch.invoiceId
  );

  await execute(
    "AMOUNT_MISMATCH",
    seeded.scenarios
      .amountMismatch.invoiceId
  );

  await execute(
    "MISSING_PO",
    seeded.scenarios
      .missingPO.invoiceId
  );

  const supplier =
    db.prepare(`
      SELECT *
      FROM suppliers
      WHERE
        supplier_code = ?
        AND organisation_id = ?
    `).get(
      `${SCENARIO_PREFIX}SUPPLIER`,
      organisationId
    );

  const purchaseOrder =
    db.prepare(`
      SELECT po.*

      FROM purchase_orders po

      INNER JOIN suppliers s
        ON s.id =
           po.supplier_id

      WHERE
        po.po_number = ?
        AND po.organisation_id = ?
        AND s.organisation_id = ?
    `).get(
      `${SCENARIO_PREFIX}PO-1001`,
      organisationId,
      organisationId
    );

  if (
    !supplier ||
    !purchaseOrder
  ) {
    throw new Error(
      "Scenario supplier or purchase order missing before duplicate test."
    );
  }

  const duplicateInvoiceId =
    createInvoice({
      organisationId,
      scenario:
        "DUPLICATE_INVOICE",
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
    getScenarioResults(
      organisationId
    );

  const passed =
    results.filter(
      (item) =>
        item.passed
    ).length;

  const summary = {
    total:
      results.length,

    passed,

    failed:
      results.length -
      passed,

    allPassed:
      results.length === 4 &&
      passed === 4,
  };

  audit(
    organisationId,
    "SCENARIO_TEST_RUN",
    "system",
    "APPA_WORKFLOW_SCENARIOS",
    `Synthetic AP workflow test completed: ${passed}/${results.length} passed`
  );

  return {
    executionOrder:
      executions,
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
