const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");

const db = require("../src/database");

const TEST_ORG = "org-user-isolation-test";
const USER_A = "user-isolation-appa";
const USER_B = "user-isolation-company-b";

const now = () => new Date().toISOString();

function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }

  console.log(`✓ ${message}`);
}

async function count(sql, params = []) {
  const row = await db.one(sql, params);
  return Number(row?.count || 0);
}

async function cleanup() {
  await db.execute(
    `
      DELETE FROM organisation_memberships
      WHERE organisation_id = $1
         OR user_id = ANY($2::text[])
    `,
    [TEST_ORG, [USER_A, USER_B]]
  );

  await db.execute(
    `
      DELETE FROM password_reset_tokens
      WHERE user_id = ANY($1::text[])
    `,
    [[USER_A, USER_B]]
  );

  await db.execute(
    `
      DELETE FROM users
      WHERE id = ANY($1::text[])
    `,
    [[USER_A, USER_B]]
  );

  await db.execute(
    `
      DELETE FROM organisations
      WHERE id = $1
    `,
    [TEST_ORG]
  );
}

async function main() {
  await cleanup();

  const appa = await db.one(
    `
      SELECT id, code
      FROM organisations
      WHERE code = 'APPA'
      LIMIT 1
    `
  );

  assert(
    appa,
    "APPA organisation exists"
  );

  const timestamp = now();

  await db.execute(
    `
      INSERT INTO organisations (
        id,
        name,
        code,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        'User Isolation Company B',
        'USER-ISO-B',
        'Active',
        $2,
        $2
      )
    `,
    [TEST_ORG, timestamp]
  );

  const passwordHash =
    await bcrypt.hash(
      "APPA-Test-Password-Only-2026!",
      4
    );

  await db.execute(
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
        'APPA Isolation User',
        'Finance Analyst',
        'Active',
        $4,
        $4
      )
    `,
    [
      USER_A,
      `appa-isolation-${randomUUID()}@example.test`,
      passwordHash,
      timestamp,
    ]
  );

  await db.execute(
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
        'Company B Isolation User',
        'Finance Analyst',
        'Active',
        $4,
        $4
      )
    `,
    [
      USER_B,
      `company-b-isolation-${randomUUID()}@example.test`,
      passwordHash,
      timestamp,
    ]
  );

  await db.execute(
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
        $4
      )
    `,
    [
      randomUUID(),
      appa.id,
      USER_A,
      timestamp,
    ]
  );

  await db.execute(
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
        $4
      )
    `,
    [
      randomUUID(),
      TEST_ORG,
      USER_B,
      timestamp,
    ]
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM users u
        JOIN organisation_memberships m
          ON m.user_id = u.id
        WHERE m.organisation_id = $1
          AND u.id = $2
      `,
      [appa.id, USER_B]
    ) === 0,
    "APPA cannot list Company B-only user"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM users u
        JOIN organisation_memberships m
          ON m.user_id = u.id
        WHERE m.organisation_id = $1
          AND u.id = $2
      `,
      [TEST_ORG, USER_A]
    ) === 0,
    "Company B cannot list APPA-only user"
  );

  const appaUpdate = await db.execute(
    `
      UPDATE users
      SET full_name = 'SHOULD NOT UPDATE',
          updated_at = $1
      WHERE id = $2
        AND EXISTS (
          SELECT 1
          FROM organisation_memberships m
          WHERE m.user_id = users.id
            AND m.organisation_id = $3
            AND m.status = 'Active'
        )
    `,
    [now(), USER_B, appa.id]
  );

  assert(
    Number(appaUpdate.rowCount || 0) === 0,
    "APPA cannot target Company B user for update"
  );

  const resetId = randomUUID();

  const resetInsert = await db.execute(
    `
      INSERT INTO password_reset_tokens (
        id,
        user_id,
        token_hash,
        expires_at,
        created_at
      )
      SELECT
        $1,
        u.id,
        $2,
        $3,
        $4
      FROM users u
      WHERE u.id = $5
        AND EXISTS (
          SELECT 1
          FROM organisation_memberships m
          WHERE m.user_id = u.id
            AND m.organisation_id = $6
            AND m.status = 'Active'
        )
    `,
    [
      resetId,
      randomUUID(),
      new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString(),
      now(),
      USER_B,
      appa.id,
    ]
  );

  assert(
    Number(resetInsert.rowCount || 0) === 0,
    "APPA cannot target Company B user for password reset"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM organisation_memberships
        WHERE organisation_id = $1
          AND user_id = $2
          AND status = 'Active'
      `,
      [appa.id, USER_A]
    ) === 1,
    "APPA can access its own member"
  );

  assert(
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM organisation_memberships
        WHERE organisation_id = $1
          AND user_id = $2
          AND status = 'Active'
      `,
      [TEST_ORG, USER_B]
    ) === 1,
    "Company B can access its own member"
  );

  const health = await db.healthCheck();

  assert(
    Boolean(health),
    "PostgreSQL health check passes"
  );

  const orphanMemberships =
    await count(
      `
        SELECT COUNT(*)::int AS count
        FROM organisation_memberships m
        LEFT JOIN organisations o
          ON o.id = m.organisation_id
        LEFT JOIN users u
          ON u.id = m.user_id
        WHERE o.id IS NULL
           OR u.id IS NULL
      `
    );

  assert(
    orphanMemberships === 0,
    "Foreign-key relationships remain clean"
  );
}

(async () => {
  let failure = null;

  try {
    await main();

    console.log("");
    console.log(
      "USER ADMINISTRATION ISOLATION TEST PASSED"
    );
  } catch (error) {
    failure = error;
    console.error(error);
  }

  try {
    await cleanup();

    const remainingOrg = await count(
      `
        SELECT COUNT(*)::int AS count
        FROM organisations
        WHERE id = $1
      `,
      [TEST_ORG]
    );

    const remainingUsers = await count(
      `
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE id = ANY($1::text[])
      `,
      [[USER_A, USER_B]]
    );

    if (
      remainingOrg !== 0 ||
      remainingUsers !== 0
    ) {
      throw new Error(
        "Temporary user isolation cleanup failed."
      );
    }

    console.log(
      "✓ Temporary Company B and test users cleaned"
    );
  } catch (cleanupError) {
    console.error(cleanupError);

    if (!failure) {
      failure = cleanupError;
    }
  }

  await db.close();

  if (failure) {
    process.exitCode = 1;
  }
})();
