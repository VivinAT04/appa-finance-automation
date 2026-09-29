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
  const migrate = db.transaction(() => {
    ensureDefaultOrganisation(db);
    assignExistingRootData(db);
    ensureMemberships(db);
  });

  migrate();
}

module.exports = {
  DEFAULT_ORGANISATION,
  runOrganisationMigration,
};
