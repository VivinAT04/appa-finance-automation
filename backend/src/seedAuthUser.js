const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const db = require("./database");

async function ensureDevelopmentAdmin() {
  const email = String(
    process.env.APPA_ADMIN_EMAIL || ""
  )
    .trim()
    .toLowerCase();

  const password = String(
    process.env.APPA_ADMIN_PASSWORD || ""
  );

  const fullName =
    String(process.env.APPA_ADMIN_NAME || "").trim() ||
    "APPA Administrator";

  if (!email || !password) {
    console.log(
      "Auth seed skipped: APPA_ADMIN_EMAIL/APPA_ADMIN_PASSWORD not configured."
    );
    return;
  }

  if (password.length < 12) {
    throw new Error(
      "APPA_ADMIN_PASSWORD must contain at least 12 characters."
    );
  }

  const existing = db.prepare(`
    SELECT id
    FROM users
    WHERE email = ?
  `).get(email);

  if (existing) {
    console.log(`Auth admin ready: ${email}`);
    return;
  }

  const now = new Date().toISOString();
  const hash = await bcrypt.hash(password, 12);

  db.prepare(`
    INSERT INTO users (
      id,
      email,
      password_hash,
      full_name,
      role,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, 'Administrator', 'Active', ?, ?)
  `).run(
    crypto.randomUUID(),
    email,
    hash,
    fullName,
    now,
    now
  );

  console.log(`Auth admin created: ${email}`);
}

module.exports = {
  ensureDevelopmentAdmin,
};
