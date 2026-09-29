const crypto = require("crypto");

const DEFAULT_ORGANISATION = Object.freeze({
  id: "org-appa-finance",
  name: "APPA Finance",
  code: "APPA",
  status: "Active",
});

const ROOT_TABLES = Object.freeze([
  "documents",
  "suppliers",
  "purchase_orders",
  "automation_runs",
  "app_settings",
  "audit_logs",
]);

function tableExists(db, table) {
  return Boolean(
    db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = ?
      LIMIT 1
    `).get(table)
  );
}

function columnsFor(db, table) {
  return db
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .map((column) => column.name);
}

function addOrganisationColumn(db, table) {
  if (!tableExists(db, table)) {
    return;
  }

  const columns = columnsFor(db, table);

  if (!columns.includes("organisation_id")) {
    db.exec(`
      ALTER TABLE "${table}"
      ADD COLUMN organisation_id TEXT
    `);
  }
}

function ensureDefaultOrganisation(db) {
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO organisations (
      id,
      name,
      code,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      code = excluded.code,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    DEFAULT_ORGANISATION.id,
    DEFAULT_ORGANISATION.name,
    DEFAULT_ORGANISATION.code,
    DEFAULT_ORGANISATION.status,
    now,
    now
  );
}

function assignExistingRootData(db) {
  for (const table of ROOT_TABLES) {
    if (!tableExists(db, table)) {
      continue;
    }

    addOrganisationColumn(db, table);

    db.prepare(`
      UPDATE "${table}"
      SET organisation_id = ?
      WHERE organisation_id IS NULL
         OR TRIM(organisation_id) = ''
    `).run(DEFAULT_ORGANISATION.id);

    db.exec(`
      CREATE INDEX IF NOT EXISTS
        "idx_${table}_organisation"
      ON "${table}"(organisation_id)
    `);
  }
}

function ensureMemberships(db) {
  if (
    !tableExists(db, "users") ||
    !tableExists(db, "organisation_memberships")
  ) {
    return;
  }

  const now = new Date().toISOString();

  const users = db.prepare(`
    SELECT id
    FROM users
  `).all();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO organisation_memberships (
      id,
      organisation_id,
      user_id,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'Active', ?, ?)
  `);

  for (const user of users) {
    insert.run(
      crypto.randomUUID(),
      DEFAULT_ORGANISATION.id,
      user.id,
      now,
      now
    );
  }
}

function runOrganisationMigration(db) {
  const migrateOwnership =
    db.transaction(() => {
      ensureDefaultOrganisation(db);
      assignExistingRootData(db);
      ensureMemberships(db);
    });

  migrateOwnership();

  rebuildOrganisationScopedTables(
    db
  );
}

module.exports = {
  DEFAULT_ORGANISATION,
  runOrganisationMigration,
};

function indexColumns(
  db,
  table
) {
  const indexes =
    db.prepare(
      `PRAGMA index_list("${table}")`
    ).all();

  return indexes.map(
    (index) => ({
      ...index,

      columns:
        db.prepare(
          `PRAGMA index_info("${index.name}")`
        )
        .all()
        .map(
          (column) =>
            column.name
        ),
    })
  );
}

function hasUniqueColumns(
  db,
  table,
  expectedColumns
) {
  return indexColumns(
    db,
    table
  ).some(
    (index) =>
      Number(index.unique) === 1 &&
      index.columns.length ===
        expectedColumns.length &&
      index.columns.every(
        (column, position) =>
          column ===
          expectedColumns[position]
      )
  );
}

function requiresOrganisationScopedUniqueness(
  db
) {
  if (
    !tableExists(db, "suppliers") ||
    !tableExists(
      db,
      "purchase_orders"
    ) ||
    !tableExists(
      db,
      "app_settings"
    )
  ) {
    return false;
  }

  const supplierReady =
    hasUniqueColumns(
      db,
      "suppliers",
      [
        "organisation_id",
        "supplier_code",
      ]
    );

  const purchaseOrderReady =
    hasUniqueColumns(
      db,
      "purchase_orders",
      [
        "organisation_id",
        "po_number",
      ]
    );

  const settingsReady =
    hasUniqueColumns(
      db,
      "app_settings",
      [
        "organisation_id",
        "setting_key",
      ]
    );

  const supplierColumns =
    db.prepare(
      `PRAGMA table_info("suppliers")`
    ).all();

  const poColumns =
    db.prepare(
      `PRAGMA table_info("purchase_orders")`
    ).all();

  const settingColumns =
    db.prepare(
      `PRAGMA table_info("app_settings")`
    ).all();

  const supplierOrg =
    supplierColumns.find(
      (column) =>
        column.name ===
        "organisation_id"
    );

  const poOrg =
    poColumns.find(
      (column) =>
        column.name ===
        "organisation_id"
    );

  const settingOrg =
    settingColumns.find(
      (column) =>
        column.name ===
        "organisation_id"
    );

  const orgNotNull =
    supplierOrg &&
    poOrg &&
    settingOrg &&
    Number(
      supplierOrg.notnull
    ) === 1 &&
    Number(
      poOrg.notnull
    ) === 1 &&
    Number(
      settingOrg.notnull
    ) === 1;

  return !(
    supplierReady &&
    purchaseOrderReady &&
    settingsReady &&
    orgNotNull
  );
}

function assertNoOrganisationDuplicates(
  db
) {
  const checks = [
    {
      label:
        "supplier code",
      sql: `
        SELECT
          organisation_id,
          supplier_code,
          COUNT(*) AS records
        FROM suppliers
        GROUP BY
          organisation_id,
          supplier_code
        HAVING COUNT(*) > 1
        LIMIT 1
      `,
    },
    {
      label:
        "purchase-order number",
      sql: `
        SELECT
          organisation_id,
          po_number,
          COUNT(*) AS records
        FROM purchase_orders
        GROUP BY
          organisation_id,
          po_number
        HAVING COUNT(*) > 1
        LIMIT 1
      `,
    },
    {
      label:
        "setting key",
      sql: `
        SELECT
          organisation_id,
          setting_key,
          COUNT(*) AS records
        FROM app_settings
        GROUP BY
          organisation_id,
          setting_key
        HAVING COUNT(*) > 1
        LIMIT 1
      `,
    },
  ];

  for (const check of checks) {
    const duplicate =
      db.prepare(
        check.sql
      ).get();

    if (duplicate) {
      throw new Error(
        `Cannot migrate ${check.label}: duplicate values exist within an organisation.`
      );
    }
  }

  const missingOwnership =
    db.prepare(`
      SELECT 'suppliers' AS source
      FROM suppliers
      WHERE
        organisation_id IS NULL
        OR TRIM(
          organisation_id
        ) = ''

      UNION ALL

      SELECT 'purchase_orders'
      FROM purchase_orders
      WHERE
        organisation_id IS NULL
        OR TRIM(
          organisation_id
        ) = ''

      UNION ALL

      SELECT 'app_settings'
      FROM app_settings
      WHERE
        organisation_id IS NULL
        OR TRIM(
          organisation_id
        ) = ''

      LIMIT 1
    `).get();

  if (missingOwnership) {
    throw new Error(
      `Cannot enforce organisation uniqueness: ${missingOwnership.source} contains records without organisation ownership.`
    );
  }
}

function rebuildOrganisationScopedTables(
  db
) {
  if (
    !requiresOrganisationScopedUniqueness(
      db
    )
  ) {
    return false;
  }

  assertNoOrganisationDuplicates(
    db
  );

  /*
   * Foreign keys must be disabled before entering
   * this transaction. database.js invokes this
   * migration during startup before serving traffic.
   */
  db.pragma(
    "foreign_keys = OFF"
  );

  try {
    const rebuild =
      db.transaction(() => {
        db.exec(`
          CREATE TABLE suppliers__org_migration (
            id TEXT PRIMARY KEY,

            supplier_code TEXT NOT NULL,

            name TEXT NOT NULL,
            email TEXT,
            tax_id TEXT,

            payment_terms_days INTEGER
              NOT NULL DEFAULT 30,

            status TEXT
              NOT NULL DEFAULT 'Active',

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,

            organisation_id TEXT NOT NULL,

            FOREIGN KEY (
              organisation_id
            )
              REFERENCES organisations(id),

            UNIQUE (
              organisation_id,
              supplier_code
            )
          );

          INSERT INTO suppliers__org_migration (
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
          SELECT
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
          FROM suppliers;


          CREATE TABLE purchase_orders__org_migration (
            id TEXT PRIMARY KEY,

            po_number TEXT NOT NULL,

            supplier_id TEXT NOT NULL,

            order_date TEXT,

            currency TEXT
              NOT NULL DEFAULT 'INR',

            subtotal REAL
              NOT NULL DEFAULT 0,

            tax_amount REAL
              NOT NULL DEFAULT 0,

            total_amount REAL
              NOT NULL DEFAULT 0,

            status TEXT
              NOT NULL DEFAULT 'Open',

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,

            organisation_id TEXT NOT NULL,

            FOREIGN KEY (
              supplier_id
            )
              REFERENCES suppliers__org_migration(id),

            FOREIGN KEY (
              organisation_id
            )
              REFERENCES organisations(id),

            UNIQUE (
              organisation_id,
              po_number
            )
          );

          INSERT INTO purchase_orders__org_migration (
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
          SELECT
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
          FROM purchase_orders;


          CREATE TABLE app_settings__org_migration (
            organisation_id TEXT NOT NULL,

            setting_key TEXT NOT NULL,

            setting_value TEXT NOT NULL,

            description TEXT,

            updated_at TEXT NOT NULL,

            PRIMARY KEY (
              organisation_id,
              setting_key
            ),

            FOREIGN KEY (
              organisation_id
            )
              REFERENCES organisations(id)
          );

          INSERT INTO app_settings__org_migration (
            organisation_id,
            setting_key,
            setting_value,
            description,
            updated_at
          )
          SELECT
            organisation_id,
            setting_key,
            setting_value,
            description,
            updated_at
          FROM app_settings;


          DROP TABLE app_settings;

          ALTER TABLE
            app_settings__org_migration
          RENAME TO app_settings;


          /*
           * purchase_order_items and invoice_matches
           * reference purchase_orders. Rebuild their
           * FK target safely after replacing the PO
           * table.
           */

          CREATE TABLE purchase_order_items__org_migration (
            id TEXT PRIMARY KEY,

            purchase_order_id TEXT NOT NULL,

            description TEXT NOT NULL,

            quantity REAL
              NOT NULL DEFAULT 0,

            unit_price REAL
              NOT NULL DEFAULT 0,

            line_total REAL
              NOT NULL DEFAULT 0,

            position INTEGER
              NOT NULL DEFAULT 0,

            created_at TEXT NOT NULL,

            FOREIGN KEY (
              purchase_order_id
            )
              REFERENCES purchase_orders__org_migration(id)
              ON DELETE CASCADE
          );

          INSERT INTO purchase_order_items__org_migration (
            id,
            purchase_order_id,
            description,
            quantity,
            unit_price,
            line_total,
            position,
            created_at
          )
          SELECT
            id,
            purchase_order_id,
            description,
            quantity,
            unit_price,
            line_total,
            position,
            created_at
          FROM purchase_order_items;


          CREATE TABLE invoice_matches__org_migration (
            id TEXT PRIMARY KEY,

            invoice_id TEXT
              NOT NULL UNIQUE,

            purchase_order_id TEXT,

            supplier_match INTEGER
              NOT NULL DEFAULT 0,

            po_reference_match INTEGER
              NOT NULL DEFAULT 0,

            currency_match INTEGER
              NOT NULL DEFAULT 0,

            subtotal_match INTEGER
              NOT NULL DEFAULT 0,

            tax_match INTEGER
              NOT NULL DEFAULT 0,

            total_match INTEGER
              NOT NULL DEFAULT 0,

            line_items_match INTEGER
              NOT NULL DEFAULT 0,

            match_score REAL
              NOT NULL DEFAULT 0,

            match_status TEXT NOT NULL,

            variance_amount REAL
              NOT NULL DEFAULT 0,

            details TEXT,

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,

            FOREIGN KEY (
              invoice_id
            )
              REFERENCES invoices(id)
              ON DELETE CASCADE,

            FOREIGN KEY (
              purchase_order_id
            )
              REFERENCES purchase_orders__org_migration(id)
          );

          INSERT INTO invoice_matches__org_migration (
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
          SELECT
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
          FROM invoice_matches;


          DROP TABLE invoice_matches;
          DROP TABLE purchase_order_items;
          DROP TABLE purchase_orders;
          DROP TABLE suppliers;


          ALTER TABLE
            suppliers__org_migration
          RENAME TO suppliers;

          ALTER TABLE
            purchase_orders__org_migration
          RENAME TO purchase_orders;

          ALTER TABLE
            purchase_order_items__org_migration
          RENAME TO purchase_order_items;

          ALTER TABLE
            invoice_matches__org_migration
          RENAME TO invoice_matches;


          CREATE INDEX
            idx_suppliers_organisation
          ON suppliers(
            organisation_id
          );

          CREATE INDEX
            idx_purchase_orders_supplier
          ON purchase_orders(
            supplier_id
          );

          CREATE INDEX
            idx_purchase_orders_number
          ON purchase_orders(
            po_number
          );

          CREATE INDEX
            idx_purchase_orders_organisation
          ON purchase_orders(
            organisation_id
          );

          CREATE INDEX
            idx_purchase_order_items_po
          ON purchase_order_items(
            purchase_order_id
          );

          CREATE INDEX
            idx_invoice_matches_invoice
          ON invoice_matches(
            invoice_id
          );

          CREATE INDEX
            idx_app_settings_organisation
          ON app_settings(
            organisation_id
          );
        `);
      });

    rebuild();
  } finally {
    db.pragma(
      "foreign_keys = ON"
    );
  }

  const violations =
    db.pragma(
      "foreign_key_check"
    );

  if (
    Array.isArray(violations) &&
    violations.length
  ) {
    throw new Error(
      `Organisation uniqueness migration produced ${violations.length} foreign-key violation(s).`
    );
  }

  return true;
}
