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

async function requireOrganisationId(
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required for synthetic workflow scenarios."
    );
  }

  const organisation =
    await db.one(
      `
        SELECT
          id,
          name,
          code,
          status
        FROM organisations
        WHERE
          id = $1
          AND status = 'Active'
      `,
      [organisationId]
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

async function audit(
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
        $1, $2, $3, $4, $5, $6, $7
      )
    `,
    [
      randomUUID(),
      action,
      entityType,
      entityId,
      description,
      now(),
      organisationId,
    ]
  );
}

async function ensureSupplier(
  organisationId
) {
  await requireOrganisationId(
    organisationId
  );

  const supplierCode =
    `${SCENARIO_PREFIX}SUPPLIER`;

  let supplier =
    await db.one(
      `
        SELECT *
        FROM suppliers
        WHERE
          supplier_code = $1
          AND organisation_id = $2
      `,
      [
        supplierCode,
        organisationId,
      ]
    );

  if (supplier) {
    return supplier;
  }

  const id =
    randomUUID();

  const timestamp =
    now();

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
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10
      )
    `,
    [
      id,
      supplierCode,
      "APPA Scenario Supplies Ltd",
      "scenario-supplier@example.test",
      "GST-APPA-SCENARIO",
      30,
      "Active",
      timestamp,
      timestamp,
      organisationId,
    ]
  );

  supplier =
    await db.one(
      `
        SELECT *
        FROM suppliers
        WHERE
          id = $1
          AND organisation_id = $2
      `,
      [
        id,
        organisationId,
      ]
    );

  return supplier;
}

async function ensurePurchaseOrder(
  supplier,
  organisationId
) {
  await requireOrganisationId(
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
    await db.one(
      `
        SELECT po.*
        FROM purchase_orders po

        INNER JOIN suppliers s
          ON s.id = po.supplier_id

        WHERE
          po.po_number = $1
          AND po.organisation_id = $2
          AND s.organisation_id = $3
      `,
      [
        poNumber,
        organisationId,
        organisationId,
      ]
    );

  if (purchaseOrder) {
    return purchaseOrder;
  }

  const poId =
    randomUUID();

  const timestamp =
    now();

  await db.transaction(
    async (tx) => {
      await tx.execute(
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
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12
          )
        `,
        [
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
          organisationId,
        ]
      );

      const lines = [
        {
          description:
            "Office Chairs",
          quantity: 4,
          unitPrice: 4500,
          lineTotal: 18000,
        },
        {
          description:
            "Printer Paper",
          quantity: 10,
          unitPrice: 300,
          lineTotal: 3000,
        },
        {
          description:
            "File Storage Boxes",
          quantity: 5,
          unitPrice: 400,
          lineTotal: 2000,
        },
      ];

      for (
        let index = 0;
        index < lines.length;
        index += 1
      ) {
        const line =
          lines[index];

        await tx.execute(
          `
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
            VALUES (
              $1, $2, $3, $4,
              $5, $6, $7, $8
            )
          `,
          [
            randomUUID(),
            poId,
            line.description,
            line.quantity,
            line.unitPrice,
            line.lineTotal,
            index,
            timestamp,
          ]
        );
      }
    }
  );

  purchaseOrder =
    await db.one(
      `
        SELECT *
        FROM purchase_orders
        WHERE
          id = $1
          AND organisation_id = $2
      `,
      [
        poId,
        organisationId,
      ]
    );

  return purchaseOrder;
}

async function createDocument({
  organisationId,
  scenario,
  filename,
}) {
  await requireOrganisationId(
    organisationId
  );

  const id =
    randomUUID();

  const timestamp =
    now();

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
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11
      )
    `,
    [
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
      organisationId,
    ]
  );

  return id;
}

async function createInvoice({
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
  await requireOrganisationId(
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
    await db.one(
      `
        SELECT i.id
        FROM invoices i

        INNER JOIN documents d
          ON d.id = i.document_id

        WHERE
          d.stored_name = $1
          AND d.organisation_id = $2
      `,
      [
        storedName,
        organisationId,
      ]
    );

  if (existing) {
    return existing.id;
  }

  const documentId =
    await createDocument({
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

  await db.transaction(
    async (tx) => {
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
          invoiceNumber,
          "2026-09-29",
          "2026-10-29",
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
          timestamp,
        ]
      );

      for (
        let index = 0;
        index < lines.length;
        index += 1
      ) {
        const line =
          lines[index];

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
            line.description,
            line.quantity,
            line.unitPrice,
            line.taxRate,
            line.lineTotal,
            index,
            timestamp,
          ]
        );
      }
    }
  );

  await audit(
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

async function seedScenarios(
  organisationId
) {
  await requireOrganisationId(
    organisationId
  );

  const supplier =
    await ensureSupplier(
      organisationId
    );

  const purchaseOrder =
    await ensurePurchaseOrder(
      supplier,
      organisationId
    );

  const cleanInvoiceId =
    await createInvoice({
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
    await createInvoice({
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
    await createInvoice({
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
    await createInvoice({
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

  await audit(
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

async function getScenarioInvoices(
  organisationId
) {
  await requireOrganisationId(
    organisationId
  );

  return db.many(
    `
      SELECT
        i.id,
        i.invoice_number AS "invoiceNumber",
        i.supplier_name AS "supplierName",
        i.currency,
        i.subtotal,
        i.tax_amount AS "taxAmount",
        i.total_amount AS "totalAmount",
        i.purchase_order_number AS "purchaseOrderNumber",
        i.validation_status AS "validationStatus",
        i.validation_message AS "validationMessage",
        i.created_at AS "createdAt",

        d.stored_name AS "storedName",

        im.match_status AS "matchStatus",
        im.match_score AS "matchScore",

        (
          SELECT COUNT(*)::int
          FROM exceptions e
          WHERE
            e.invoice_id = i.id
            AND e.status = 'Open'
        ) AS "openExceptions",

        (
          SELECT a.decision
          FROM approvals a
          WHERE
            a.invoice_id = i.id
          ORDER BY
            a.created_at DESC
          LIMIT 1
        ) AS "latestDecision"

      FROM invoices i

      INNER JOIN documents d
        ON d.id = i.document_id

      LEFT JOIN invoice_matches im
        ON im.invoice_id = i.id

      WHERE
        d.stored_name LIKE $1
        AND d.organisation_id = $2

      ORDER BY
        i.created_at ASC
    `,
    [
      `${SCENARIO_PREFIX}%`,
      organisationId,
    ]
  );
}

async function getScenarioResults(
  organisationId
) {
  const invoices =
    await getScenarioInvoices(
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

async function removeScenarioData(
  organisationId
) {
  await requireOrganisationId(
    organisationId
  );

  const docs =
    await db.many(
      `
        SELECT id
        FROM documents
        WHERE
          stored_name LIKE $1
          AND organisation_id = $2
      `,
      [
        `${SCENARIO_PREFIX}%`,
        organisationId,
      ]
    );

  const documentIds =
    docs.map(
      (row) => row.id
    );

  const invoiceRows =
    documentIds.length
      ? await db.many(
          `
            SELECT i.id
            FROM invoices i

            INNER JOIN documents d
              ON d.id =
                i.document_id

            WHERE
              i.document_id =
                ANY($1::text[])
              AND d.organisation_id = $2
          `,
          [
            documentIds,
            organisationId,
          ]
        )
      : [];

  const invoiceIds =
    invoiceRows.map(
      (row) => row.id
    );

  await db.transaction(
    async (tx) => {
      if (
        invoiceIds.length
      ) {
        await tx.execute(
          `
            DELETE FROM approvals
            WHERE
              invoice_id =
                ANY($1::text[])
              AND invoice_id IN (
                SELECT i.id
                FROM invoices i
                INNER JOIN documents d
                  ON d.id =
                    i.document_id
                WHERE
                  d.organisation_id = $2
              )
          `,
          [
            invoiceIds,
            organisationId,
          ]
        );

        await tx.execute(
          `
            DELETE FROM exceptions
            WHERE
              invoice_id =
                ANY($1::text[])
              AND invoice_id IN (
                SELECT i.id
                FROM invoices i
                INNER JOIN documents d
                  ON d.id =
                    i.document_id
                WHERE
                  d.organisation_id = $2
              )
          `,
          [
            invoiceIds,
            organisationId,
          ]
        );

        await tx.execute(
          `
            DELETE FROM invoice_matches
            WHERE
              invoice_id =
                ANY($1::text[])
              AND invoice_id IN (
                SELECT i.id
                FROM invoices i
                INNER JOIN documents d
                  ON d.id =
                    i.document_id
                WHERE
                  d.organisation_id = $2
              )
          `,
          [
            invoiceIds,
            organisationId,
          ]
        );

        await tx.execute(
          `
            DELETE FROM invoice_line_items
            WHERE
              invoice_id =
                ANY($1::text[])
              AND invoice_id IN (
                SELECT i.id
                FROM invoices i
                INNER JOIN documents d
                  ON d.id =
                    i.document_id
                WHERE
                  d.organisation_id = $2
              )
          `,
          [
            invoiceIds,
            organisationId,
          ]
        );

        await tx.execute(
          `
            DELETE FROM invoices
            WHERE
              id = ANY($1::text[])
              AND document_id IN (
                SELECT id
                FROM documents
                WHERE organisation_id = $2
              )
          `,
          [
            invoiceIds,
            organisationId,
          ]
        );
      }

      if (
        documentIds.length
      ) {
        await tx.execute(
          `
            DELETE FROM documents
            WHERE
              id = ANY($1::text[])
              AND organisation_id = $2
          `,
          [
            documentIds,
            organisationId,
          ]
        );
      }

      const poRows =
        await tx.many(
          `
            SELECT id
            FROM purchase_orders
            WHERE
              po_number LIKE $1
              AND organisation_id = $2
          `,
          [
            `${SCENARIO_PREFIX}%`,
            organisationId,
          ]
        );

      const poIds =
        poRows.map(
          (row) => row.id
        );

      if (
        poIds.length
      ) {
        await tx.execute(
          `
            DELETE FROM purchase_order_items
            WHERE
              purchase_order_id =
                ANY($1::text[])
              AND purchase_order_id IN (
                SELECT id
                FROM purchase_orders
                WHERE organisation_id = $2
              )
          `,
          [
            poIds,
            organisationId,
          ]
        );

        await tx.execute(
          `
            DELETE FROM purchase_orders
            WHERE
              id = ANY($1::text[])
              AND organisation_id = $2
          `,
          [
            poIds,
            organisationId,
          ]
        );
      }

      await tx.execute(
        `
          DELETE FROM suppliers
          WHERE
            supplier_code LIKE $1
            AND organisation_id = $2
        `,
        [
          `${SCENARIO_PREFIX}%`,
          organisationId,
        ]
      );

      await tx.execute(
        `
          DELETE FROM audit_logs
          WHERE
            action LIKE 'SCENARIO\\_%'
            AND organisation_id = $1
        `,
        [
          organisationId,
        ]
      );
    }
  );

  return {
    documentsRemoved:
      documentIds.length,

    invoicesRemoved:
      invoiceIds.length,
  };
}

async function removeSingleInvoice(
  invoiceId,
  organisationId
) {
  const invoice =
    await db.one(
      `
        SELECT
          i.id,
          i.document_id AS "documentId"

        FROM invoices i

        INNER JOIN documents d
          ON d.id =
            i.document_id

        WHERE
          i.id = $1
          AND d.organisation_id = $2
      `,
      [
        invoiceId,
        organisationId,
      ]
    );

  if (!invoice) {
    return;
  }

  await db.transaction(
    async (tx) => {
      await tx.execute(
        `
          DELETE FROM approvals
          WHERE invoice_id = $1
        `,
        [invoiceId]
      );

      await tx.execute(
        `
          DELETE FROM exceptions
          WHERE invoice_id = $1
        `,
        [invoiceId]
      );

      await tx.execute(
        `
          DELETE FROM invoice_matches
          WHERE invoice_id = $1
        `,
        [invoiceId]
      );

      await tx.execute(
        `
          DELETE FROM invoice_line_items
          WHERE invoice_id = $1
        `,
        [invoiceId]
      );

      await tx.execute(
        `
          DELETE FROM invoices
          WHERE id = $1
        `,
        [invoiceId]
      );

      await tx.execute(
        `
          DELETE FROM documents
          WHERE
            id = $1
            AND organisation_id = $2
        `,
        [
          invoice.documentId,
          organisationId,
        ]
      );
    }
  );
}

async function runScenarios(
  organisationId
) {
  await requireOrganisationId(
    organisationId
  );

  /*
   * Reset only the selected organisation's
   * APPA-SCN-* synthetic scenario data.
   */
  await removeScenarioData(
    organisationId
  );

  const seeded =
    await seedScenarios(
      organisationId
    );

  /*
   * The duplicate scenario is initially
   * seeded so the scenario contract remains
   * identical to the previous implementation.
   * Remove it before executing the first three
   * scenarios, then recreate it after the clean
   * invoice has been matched.
   */
  const duplicateSeedId =
    seeded.scenarios
      .duplicateInvoice
      .invoiceId;

  await removeSingleInvoice(
    duplicateSeedId,
    organisationId
  );

  const executions = [];

  async function execute(
    name,
    invoiceId
  ) {
    try {
      const result =
        await matchInvoice(
          invoiceId,
          organisationId
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
    await db.one(
      `
        SELECT *
        FROM suppliers
        WHERE
          supplier_code = $1
          AND organisation_id = $2
      `,
      [
        `${SCENARIO_PREFIX}SUPPLIER`,
        organisationId,
      ]
    );

  const purchaseOrder =
    await db.one(
      `
        SELECT po.*

        FROM purchase_orders po

        INNER JOIN suppliers s
          ON s.id =
            po.supplier_id

        WHERE
          po.po_number = $1
          AND po.organisation_id = $2
          AND s.organisation_id = $3
      `,
      [
        `${SCENARIO_PREFIX}PO-1001`,
        organisationId,
        organisationId,
      ]
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
    await createInvoice({
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
    await getScenarioResults(
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

  await audit(
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
