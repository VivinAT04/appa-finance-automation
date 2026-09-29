const { randomUUID } = require("crypto");
const db = require("./database");

function seedEnterpriseData(organisationId) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required to seed enterprise data."
    );
  }

  const organisation = db.prepare(`
    SELECT
      id,
      name,
      code,
      status
    FROM organisations
    WHERE
      id = ?
      AND status = 'Active'
  `).get(organisationId);

  if (!organisation) {
    throw new Error(
      "Active organisation not found."
    );
  }

  const now =
    new Date().toISOString();

  /*
   * Supplier ownership is explicit.
   *
   * supplier_code is still globally UNIQUE in the
   * current database schema. Block 14B.2E will migrate
   * that constraint to:
   *
   *   UNIQUE(organisation_id, supplier_code)
   *
   * Until then, every lookup below still requires the
   * selected organisation so data can never be silently
   * reused across tenants.
   */
  let supplier = db.prepare(`
    SELECT *
    FROM suppliers
    WHERE
      supplier_code = ?
      AND organisation_id = ?
  `).get(
    "SUP-DEMO-001",
    organisationId
  );

  if (!supplier) {
    const conflictingSupplier =
      db.prepare(`
        SELECT
          id,
          organisation_id
        FROM suppliers
        WHERE supplier_code = ?
      `).get("SUP-DEMO-001");

    if (
      conflictingSupplier &&
      conflictingSupplier.organisation_id !==
        organisationId
    ) {
      throw new Error(
        "Demo supplier code already belongs to another organisation. Per-organisation uniqueness migration is required before seeding this organisation."
      );
    }

    const id =
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
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      id,
      "SUP-DEMO-001",
      "Demo Office Supplies Ltd",
      "accounts@demo-office.example",
      "GST-DEMO-001",
      30,
      "Active",
      now,
      now,
      organisationId
    );

    supplier = db.prepare(`
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

  /*
   * Purchase orders are isolated by organisation.
   * The supplier must belong to the same organisation.
   */
  let po = db.prepare(`
    SELECT
      po.*
    FROM purchase_orders po

    JOIN suppliers s
      ON s.id = po.supplier_id

    WHERE
      po.po_number = ?
      AND po.organisation_id = ?
      AND s.organisation_id = ?
  `).get(
    "PO-TEST-1001",
    organisationId,
    organisationId
  );

  if (!po) {
    const conflictingPo =
      db.prepare(`
        SELECT
          id,
          organisation_id
        FROM purchase_orders
        WHERE po_number = ?
      `).get("PO-TEST-1001");

    if (
      conflictingPo &&
      conflictingPo.organisation_id !==
        organisationId
    ) {
      throw new Error(
        "Demo purchase-order number already belongs to another organisation. Per-organisation uniqueness migration is required before seeding this organisation."
      );
    }

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
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      poId,
      "PO-TEST-1001",
      supplier.id,
      "2026-09-20",
      "INR",
      23000,
      4140,
      27140,
      "Open",
      now,
      now,
      organisationId
    );

    const insert =
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

    const items = [
      [
        "Office Chairs",
        4,
        4500,
        18000,
      ],
      [
        "Printer Paper",
        10,
        300,
        3000,
      ],
      [
        "File Storage Boxes",
        5,
        400,
        2000,
      ],
    ];

    const insertItems =
      db.transaction(() => {
        items.forEach(
          (item, index) => {
            insert.run(
              randomUUID(),
              poId,
              item[0],
              item[1],
              item[2],
              item[3],
              index + 1,
              now
            );
          }
        );
      });

    insertItems();

    po = db.prepare(`
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

  /*
   * Workflow settings are organisation-owned.
   *
   * The current database still has setting_key as the
   * global primary key. Block 14B.2E will migrate it to
   * organisation-scoped uniqueness.
   *
   * Existing APPA settings are therefore reused only
   * when they already belong to this organisation.
   */
  const settings = [
    [
      "amount_tolerance",
      "1.00",
      "Allowed invoice versus PO amount variance.",
    ],
    [
      "auto_approval_match_score",
      "100",
      "Required PO match score for automatic approval.",
    ],
    [
      "duplicate_detection",
      "true",
      "Enable duplicate invoice detection.",
    ],
  ];

  for (const row of settings) {
    const existing =
      db.prepare(`
        SELECT
          setting_key,
          organisation_id
        FROM app_settings
        WHERE setting_key = ?
      `).get(row[0]);

    if (existing) {
      if (
        existing.organisation_id !==
        organisationId
      ) {
        throw new Error(
          `Setting ${row[0]} belongs to another organisation. Per-organisation settings migration is required before seeding this organisation.`
        );
      }

      continue;
    }

    db.prepare(`
      INSERT INTO app_settings (
        setting_key,
        setting_value,
        description,
        updated_at,
        organisation_id
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      row[0],
      row[1],
      row[2],
      now,
      organisationId
    );
  }

  return {
    organisation,
    supplier,
    po,
  };
}

module.exports = {
  seedEnterpriseData,
};
