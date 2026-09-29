const { randomUUID } = require("crypto");
const db = require("./database");

function seedEnterpriseData() {
  const now = new Date().toISOString();

  let supplier = db.prepare(`
    SELECT *
    FROM suppliers
    WHERE supplier_code = ?
  `).get("SUP-DEMO-001");

  if (!supplier) {
    const id = randomUUID();

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
      "SUP-DEMO-001",
      "Demo Office Supplies Ltd",
      "accounts@demo-office.example",
      "GST-DEMO-001",
      30,
      "Active",
      now,
      now
    );

    supplier = db.prepare(`
      SELECT *
      FROM suppliers
      WHERE id = ?
    `).get(id);
  }

  let po = db.prepare(`
    SELECT *
    FROM purchase_orders
    WHERE po_number = ?
  `).get("PO-TEST-1001");

  if (!po) {
    const poId = randomUUID();

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
      "PO-TEST-1001",
      supplier.id,
      "2026-09-20",
      "INR",
      23000,
      4140,
      27140,
      "Open",
      now,
      now
    );

    const insert = db.prepare(`
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
      ["Office Chairs", 4, 4500, 18000],
      ["Printer Paper", 10, 300, 3000],
      ["File Storage Boxes", 5, 400, 2000],
    ];

    items.forEach((item, index) => {
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
    });

    po = db.prepare(`
      SELECT *
      FROM purchase_orders
      WHERE id = ?
    `).get(poId);
  }

  const settings = [
    [
      "amount_tolerance",
      "1.00",
      "Allowed invoice versus PO amount variance."
    ],
    [
      "auto_approval_match_score",
      "100",
      "Required PO match score for automatic approval."
    ],
    [
      "duplicate_detection",
      "true",
      "Enable duplicate invoice detection."
    ]
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO app_settings (
      setting_key,
      setting_value,
      description,
      updated_at
    )
    VALUES (?, ?, ?, ?)
  `);

  settings.forEach((row) => {
    insertSetting.run(
      row[0],
      row[1],
      row[2],
      now
    );
  });

  return {
    supplier,
    po,
  };
}

module.exports = {
  seedEnterpriseData,
};
