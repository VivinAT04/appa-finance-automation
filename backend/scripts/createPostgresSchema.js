require("dotenv").config();

const { Client } = require("pg");

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
}

async function main() {
  const client = createClient();

  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS organisations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS
        idx_organisations_code_ci
      ON organisations (LOWER(code));

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Finance Analyst',
        status TEXT NOT NULL DEFAULT 'Active',
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS
        idx_users_email_ci
      ON users (LOWER(email));

      CREATE TABLE IF NOT EXISTS organisation_memberships (
        id TEXT PRIMARY KEY,
        organisation_id TEXT NOT NULL
          REFERENCES organisations(id)
          ON DELETE CASCADE,
        user_id TEXT NOT NULL
          REFERENCES users(id)
          ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (organisation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL
          REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        original_name TEXT NOT NULL,
        stored_name TEXT NOT NULL,
        mime_type TEXT,
        size BIGINT NOT NULL DEFAULT 0,
        document_type TEXT NOT NULL DEFAULT 'Unclassified',
        status TEXT NOT NULL DEFAULT 'Uploaded',
        extraction_status TEXT NOT NULL DEFAULT 'Pending',
        uploaded_by TEXT NOT NULL DEFAULT 'Administrator',
        created_at TIMESTAMPTZ NOT NULL,
        organisation_id TEXT NOT NULL
          REFERENCES organisations(id)
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        supplier_code TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        tax_id TEXT,
        payment_terms_days INTEGER NOT NULL DEFAULT 30,
        status TEXT NOT NULL DEFAULT 'Active',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        organisation_id TEXT NOT NULL
          REFERENCES organisations(id),
        UNIQUE (organisation_id, supplier_code)
      );

      CREATE TABLE IF NOT EXISTS purchase_orders (
        id TEXT PRIMARY KEY,
        po_number TEXT NOT NULL,
        supplier_id TEXT NOT NULL
          REFERENCES suppliers(id),
        order_date DATE,
        currency TEXT NOT NULL DEFAULT 'INR',
        subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'Open',
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        organisation_id TEXT NOT NULL
          REFERENCES organisations(id),
        UNIQUE (organisation_id, po_number)
      );

      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id TEXT PRIMARY KEY,
        purchase_order_id TEXT NOT NULL
          REFERENCES purchase_orders(id)
          ON DELETE CASCADE,
        description TEXT NOT NULL,
        quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
        unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
        line_total NUMERIC(18,2) NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL UNIQUE
          REFERENCES documents(id)
          ON DELETE CASCADE,
        invoice_number TEXT,
        invoice_date DATE,
        due_date DATE,
        supplier_name TEXT,
        supplier_email TEXT,
        supplier_tax_id TEXT,
        currency TEXT DEFAULT 'GBP',
        subtotal NUMERIC(18,2),
        tax_amount NUMERIC(18,2),
        total_amount NUMERIC(18,2),
        purchase_order_number TEXT,
        extraction_confidence NUMERIC(7,4),
        validation_status TEXT NOT NULL DEFAULT 'Pending',
        validation_message TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_line_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL
          REFERENCES invoices(id)
          ON DELETE CASCADE,
        description TEXT,
        quantity NUMERIC(18,4),
        unit_price NUMERIC(18,4),
        tax_rate NUMERIC(10,4),
        line_total NUMERIC(18,2),
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS invoice_matches (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL UNIQUE
          REFERENCES invoices(id)
          ON DELETE CASCADE,
        purchase_order_id TEXT
          REFERENCES purchase_orders(id),
        supplier_match INTEGER NOT NULL DEFAULT 0,
        po_reference_match INTEGER NOT NULL DEFAULT 0,
        currency_match INTEGER NOT NULL DEFAULT 0,
        subtotal_match INTEGER NOT NULL DEFAULT 0,
        tax_match INTEGER NOT NULL DEFAULT 0,
        total_match INTEGER NOT NULL DEFAULT 0,
        line_items_match INTEGER NOT NULL DEFAULT 0,
        match_score NUMERIC(7,4) NOT NULL DEFAULT 0,
        match_status TEXT NOT NULL,
        variance_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
        details TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL
          REFERENCES invoices(id)
          ON DELETE CASCADE,
        decision TEXT NOT NULL,
        approval_type TEXT NOT NULL,
        approver TEXT,
        comments TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS exceptions (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL
          REFERENCES invoices(id)
          ON DELETE CASCADE,
        exception_type TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'Medium',
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Open',
        resolution TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS automation_runs (
        id TEXT PRIMARY KEY,
        process_name TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'APPA Engine',
        status TEXT NOT NULL,
        items_processed INTEGER NOT NULL DEFAULT 0,
        items_succeeded INTEGER NOT NULL DEFAULT 0,
        items_failed INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        details TEXT,
        organisation_id TEXT NOT NULL
          REFERENCES organisations(id)
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        organisation_id TEXT NOT NULL
          REFERENCES organisations(id),
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (
          organisation_id,
          setting_key
        )
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        organisation_id TEXT NOT NULL
          REFERENCES organisations(id)
      );

      CREATE INDEX IF NOT EXISTS idx_org_memberships_user
        ON organisation_memberships(user_id);

      CREATE INDEX IF NOT EXISTS idx_org_memberships_org
        ON organisation_memberships(organisation_id);

      CREATE INDEX IF NOT EXISTS idx_password_reset_user
        ON password_reset_tokens(user_id);

      CREATE INDEX IF NOT EXISTS idx_password_reset_hash
        ON password_reset_tokens(token_hash);

      CREATE INDEX IF NOT EXISTS idx_documents_organisation
        ON documents(organisation_id);

      CREATE INDEX IF NOT EXISTS idx_suppliers_organisation
        ON suppliers(organisation_id);

      CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
        ON purchase_orders(supplier_id);

      CREATE INDEX IF NOT EXISTS idx_purchase_orders_number
        ON purchase_orders(po_number);

      CREATE INDEX IF NOT EXISTS idx_purchase_orders_organisation
        ON purchase_orders(organisation_id);

      CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po
        ON purchase_order_items(purchase_order_id);

      CREATE INDEX IF NOT EXISTS idx_invoices_document
        ON invoices(document_id);

      CREATE INDEX IF NOT EXISTS idx_invoices_number
        ON invoices(invoice_number);

      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
        ON invoice_line_items(invoice_id);

      CREATE INDEX IF NOT EXISTS idx_invoice_matches_invoice
        ON invoice_matches(invoice_id);

      CREATE INDEX IF NOT EXISTS idx_approvals_invoice
        ON approvals(invoice_id);

      CREATE INDEX IF NOT EXISTS idx_exceptions_invoice
        ON exceptions(invoice_id);

      CREATE INDEX IF NOT EXISTS idx_automation_runs_organisation
        ON automation_runs(organisation_id);

      CREATE INDEX IF NOT EXISTS idx_app_settings_organisation
        ON app_settings(organisation_id);

      CREATE INDEX IF NOT EXISTS idx_audit_logs_organisation
        ON audit_logs(organisation_id);
    `);

    await client.query("COMMIT");

    console.log(
      "✓ APPA PostgreSQL schema ready"
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
