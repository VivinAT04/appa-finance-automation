require("dotenv").config();

const Database = require("better-sqlite3");
const { Client } = require("pg");
const path = require("path");

const sqlite = new Database(
  path.join(__dirname, "..", "data", "appa.db"),
  {
    readonly: true,
  }
);

const pg = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const TABLES = [
  "organisations",
  "users",
  "organisation_memberships",
  "password_reset_tokens",
  "documents",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
  "invoices",
  "invoice_line_items",
  "invoice_matches",
  "approvals",
  "exceptions",
  "automation_runs",
  "app_settings",
  "audit_logs",
];

const DATE_COLUMNS = {
  invoices: new Set([
    "invoice_date",
    "due_date",
  ]),
  purchase_orders: new Set([
    "order_date",
  ]),
};

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function normalizeDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return value;
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const match = text.match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  if (!match) {
    throw new Error(
      `Unsupported DATE value: ${text}`
    );
  }

  const [, day, month, year] = match;

  const normalized =
    `${year}-${month}-${day}`;

  const date = new Date(
    `${normalized}T00:00:00Z`
  );

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(
      `Invalid DATE value: ${text}`
    );
  }

  return normalized;
}

function transformValue(
  table,
  column,
  value
) {
  if (
    DATE_COLUMNS[table] &&
    DATE_COLUMNS[table].has(column)
  ) {
    return normalizeDate(value);
  }

  return value;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not configured."
    );
  }

  await pg.connect();

  let existingRows = 0;

  for (const table of TABLES) {
    const result = await pg.query(
      `SELECT COUNT(*)::int AS count
       FROM ${quoteIdentifier(table)}`
    );

    existingRows += result.rows[0].count;
  }

  if (existingRows !== 0) {
    throw new Error(
      "PostgreSQL destination must be empty before migration."
    );
  }

  await pg.query("BEGIN");

  try {
    for (const table of TABLES) {
      const columns = sqlite
        .prepare(
          `PRAGMA table_info(${quoteIdentifier(table)})`
        )
        .all()
        .map(column => column.name);

      const rows = sqlite
        .prepare(
          `SELECT *
           FROM ${quoteIdentifier(table)}`
        )
        .all();

      if (!rows.length) {
        console.log(
          `✓ ${table}: 0`
        );
        continue;
      }

      const columnSql = columns
        .map(quoteIdentifier)
        .join(", ");

      const placeholders = columns
        .map(
          (_, index) => `$${index + 1}`
        )
        .join(", ");

      const insertSql = `
        INSERT INTO ${quoteIdentifier(table)}
          (${columnSql})
        VALUES
          (${placeholders})
      `;

      for (const row of rows) {
        const values = columns.map(
          column =>
            transformValue(
              table,
              column,
              row[column]
            )
        );

        await pg.query(
          insertSql,
          values
        );
      }

      console.log(
        `✓ ${table}: ${rows.length}`
      );
    }

    for (const table of TABLES) {
      const sqliteCount = sqlite
        .prepare(
          `SELECT COUNT(*) AS count
           FROM ${quoteIdentifier(table)}`
        )
        .get().count;

      const result = await pg.query(
        `SELECT COUNT(*)::int AS count
         FROM ${quoteIdentifier(table)}`
      );

      if (
        sqliteCount !== result.rows[0].count
      ) {
        throw new Error(
          `Count mismatch for ${table}`
        );
      }
    }

    await pg.query("COMMIT");

    console.log(
      "✓ SQLite → PostgreSQL migration complete"
    );
  } catch (error) {
    await pg.query("ROLLBACK");
    throw error;
  } finally {
    sqlite.close();
    await pg.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
