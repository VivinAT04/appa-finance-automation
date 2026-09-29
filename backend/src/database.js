const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "appa.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER NOT NULL DEFAULT 0,
    document_type TEXT NOT NULL DEFAULT 'Unclassified',
    status TEXT NOT NULL DEFAULT 'Uploaded',
    extraction_status TEXT NOT NULL DEFAULT 'Pending',
    uploaded_by TEXT NOT NULL DEFAULT 'Administrator',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    description TEXT,
    created_at TEXT NOT NULL
  );
`);


/* =========================================================
   APPA PHASE 3 — INVOICE EXTRACTION DATA
   ========================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL UNIQUE,

    invoice_number TEXT,
    invoice_date TEXT,
    due_date TEXT,

    supplier_name TEXT,
    supplier_email TEXT,
    supplier_tax_id TEXT,

    currency TEXT DEFAULT 'GBP',

    subtotal REAL,
    tax_amount REAL,
    total_amount REAL,

    purchase_order_number TEXT,

    extraction_confidence REAL,
    validation_status TEXT NOT NULL DEFAULT 'Pending',
    validation_message TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (document_id)
      REFERENCES documents(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invoice_line_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,

    description TEXT,
    quantity REAL,
    unit_price REAL,
    tax_rate REAL,
    line_total REAL,

    position INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,

    FOREIGN KEY (invoice_id)
      REFERENCES invoices(id)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_invoices_document
    ON invoices(document_id);

  CREATE INDEX IF NOT EXISTS idx_invoices_number
    ON invoices(invoice_number);

  CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice
    ON invoice_line_items(invoice_id);
`);


/* APPA ENTERPRISE AP WORKFLOW */

db.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    supplier_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    tax_id TEXT,
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    status TEXT NOT NULL DEFAULT 'Active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    po_number TEXT NOT NULL UNIQUE,
    supplier_id TEXT NOT NULL,
    order_date TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    subtotal REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (supplier_id)
      REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id TEXT PRIMARY KEY,
    purchase_order_id TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,

    FOREIGN KEY (purchase_order_id)
      REFERENCES purchase_orders(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS invoice_matches (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL UNIQUE,
    purchase_order_id TEXT,

    supplier_match INTEGER NOT NULL DEFAULT 0,
    po_reference_match INTEGER NOT NULL DEFAULT 0,
    currency_match INTEGER NOT NULL DEFAULT 0,
    subtotal_match INTEGER NOT NULL DEFAULT 0,
    tax_match INTEGER NOT NULL DEFAULT 0,
    total_match INTEGER NOT NULL DEFAULT 0,
    line_items_match INTEGER NOT NULL DEFAULT 0,

    match_score REAL NOT NULL DEFAULT 0,
    match_status TEXT NOT NULL,
    variance_amount REAL NOT NULL DEFAULT 0,
    details TEXT,

    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (invoice_id)
      REFERENCES invoices(id)
      ON DELETE CASCADE,

    FOREIGN KEY (purchase_order_id)
      REFERENCES purchase_orders(id)
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    approval_type TEXT NOT NULL,
    approver TEXT,
    comments TEXT,
    created_at TEXT NOT NULL,

    FOREIGN KEY (invoice_id)
      REFERENCES invoices(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS exceptions (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    exception_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'Medium',
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Open',
    resolution TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT,

    FOREIGN KEY (invoice_id)
      REFERENCES invoices(id)
      ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS automation_runs (
    id TEXT PRIMARY KEY,
    process_name TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'APPA Engine',
    status TEXT NOT NULL,
    items_processed INTEGER NOT NULL DEFAULT 0,
    items_succeeded INTEGER NOT NULL DEFAULT 0,
    items_failed INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    details TEXT
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier
    ON purchase_orders(supplier_id);

  CREATE INDEX IF NOT EXISTS idx_purchase_orders_number
    ON purchase_orders(po_number);

  CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po
    ON purchase_order_items(purchase_order_id);

  CREATE INDEX IF NOT EXISTS idx_invoice_matches_invoice
    ON invoice_matches(invoice_id);

  CREATE INDEX IF NOT EXISTS idx_approvals_invoice
    ON approvals(invoice_id);

  CREATE INDEX IF NOT EXISTS idx_exceptions_invoice
    ON exceptions(invoice_id);
`);

module.exports = db;
