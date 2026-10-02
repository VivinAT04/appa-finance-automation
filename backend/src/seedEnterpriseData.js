const {
  randomUUID,
} = require("crypto");

const db =
  require("./database");

async function seedEnterpriseData(
  organisationId
) {
  if (!organisationId) {
    throw new Error(
      "organisationId is required to seed enterprise data."
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
    throw new Error(
      "Active organisation not found."
    );
  }

  const timestamp =
    new Date().toISOString();

  const supplierCode =
    "SUP-UK-001";

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

  if (!supplier) {
    const supplierId =
      randomUUID();

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
        ON CONFLICT (
          organisation_id,
          supplier_code
        )
        DO NOTHING
      `,
      [
        supplierId,
        supplierCode,
        "Northstar Technology Supplies Ltd",
        "accounts@northstar-demo.example",
        "GB-DEMO-882041",
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
            supplier_code = $1
            AND organisation_id = $2
        `,
        [
          supplierCode,
          organisationId,
        ]
      );
  }

  if (!supplier) {
    throw new Error(
      "Unable to initialise demo supplier."
    );
  }

  const poNumber =
    "PO-2026-1001";

  let po =
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
        poNumber,
        organisationId,
        organisationId,
      ]
    );

  if (!po) {
    const poId =
      randomUUID();

    const items = [
      [
        "USB-C Docking Stations",
        2,
        125,
        250,
      ],
      [
        "Wireless Keyboards",
        3,
        45,
        135,
      ],
      [
        "27-inch Office Monitors",
        1,
        220,
        220,
      ],
    ];

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
            ON CONFLICT (
              organisation_id,
              po_number
            )
            DO NOTHING
          `,
          [
            poId,
            poNumber,
            supplier.id,
            "2026-09-28",
            "GBP",
            605,
            121,
            726,
            "Open",
            timestamp,
            timestamp,
            organisationId,
          ]
        );

        const insertedPo =
          await tx.one(
            `
              SELECT id
              FROM purchase_orders
              WHERE
                po_number = $1
                AND organisation_id = $2
            `,
            [
              poNumber,
              organisationId,
            ]
          );

        if (!insertedPo) {
          throw new Error(
            "Unable to initialise demo purchase order."
          );
        }

        const itemCount =
          await tx.one(
            `
              SELECT
                COUNT(*)::int AS count
              FROM purchase_order_items
              WHERE purchase_order_id = $1
            `,
            [insertedPo.id]
          );

        if (
          Number(
            itemCount?.count || 0
          ) === 0
        ) {
          for (
            let index = 0;
            index < items.length;
            index += 1
          ) {
            const item =
              items[index];

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
                insertedPo.id,
                item[0],
                item[1],
                item[2],
                item[3],
                index + 1,
                timestamp,
              ]
            );
          }
        }
      }
    );

    po =
      await db.one(
        `
          SELECT *
          FROM purchase_orders
          WHERE
            po_number = $1
            AND organisation_id = $2
        `,
        [
          poNumber,
          organisationId,
        ]
      );
  }

  if (!po) {
    throw new Error(
      "Unable to initialise demo purchase order."
    );
  }

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
    await db.execute(
      `
        INSERT INTO app_settings (
          setting_key,
          setting_value,
          description,
          updated_at,
          organisation_id
        )
        VALUES (
          $1, $2, $3, $4, $5
        )
        ON CONFLICT (
          organisation_id,
          setting_key
        )
        DO NOTHING
      `,
      [
        row[0],
        row[1],
        row[2],
        timestamp,
        organisationId,
      ]
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
