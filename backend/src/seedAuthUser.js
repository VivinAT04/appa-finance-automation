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
    String(
      process.env.APPA_ADMIN_NAME || ""
    ).trim() ||
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

  const existing = await db.one(
    `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `,
    [email]
  );

  if (existing) {
    console.log(
      `Auth admin ready: ${email}`
    );
    return;
  }

  const organisation =
    await db.one(`
      SELECT id
      FROM organisations
      WHERE status = 'Active'
      ORDER BY created_at ASC
      LIMIT 1
    `);

  if (!organisation) {
    throw new Error(
      "Cannot create development administrator without an active organisation."
    );
  }

  const now =
    new Date().toISOString();

  const hash =
    await bcrypt.hash(
      password,
      12
    );

  const userId =
    crypto.randomUUID();

  await db.transaction(
    async (tx) => {
      await tx.execute(
        `
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
          VALUES (
            $1,
            $2,
            $3,
            $4,
            'Administrator',
            'Active',
            $5,
            $6
          )
        `,
        [
          userId,
          email,
          hash,
          fullName,
          now,
          now,
        ]
      );

      await tx.execute(
        `
          INSERT INTO organisation_memberships (
            id,
            organisation_id,
            user_id,
            status,
            created_at,
            updated_at
          )
          VALUES (
            $1,
            $2,
            $3,
            'Active',
            $4,
            $5
          )
        `,
        [
          crypto.randomUUID(),
          organisation.id,
          userId,
          now,
          now,
        ]
      );
    }
  );

  console.log(
    `Auth admin created: ${email}`
  );
}

module.exports = {
  ensureDevelopmentAdmin,
};
