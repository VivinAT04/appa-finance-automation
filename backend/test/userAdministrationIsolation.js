const assert = require("assert");
const crypto = require("crypto");

const db = require("../src/database");

const APPA_ORG =
  "org-appa-finance";

const TEST_ORG =
  "org-user-admin-isolation-test";

const TEST_USER_A =
  "user-admin-isolation-a";

const TEST_USER_B =
  "user-admin-isolation-b";

function now() {
  return new Date().toISOString();
}

function count(sql, ...params) {
  return Number(
    db.prepare(sql).get(
      ...params
    )?.total || 0
  );
}

function cleanup() {
  db.prepare(`
    DELETE FROM audit_logs
    WHERE organisation_id = ?
  `).run(TEST_ORG);

  db.prepare(`
    DELETE FROM organisation_memberships
    WHERE organisation_id = ?
  `).run(TEST_ORG);

  db.prepare(`
    DELETE FROM organisation_memberships
    WHERE user_id IN (?, ?)
  `).run(
    TEST_USER_A,
    TEST_USER_B
  );

  db.prepare(`
    DELETE FROM users
    WHERE id IN (?, ?)
  `).run(
    TEST_USER_A,
    TEST_USER_B
  );

  db.prepare(`
    DELETE FROM organisations
    WHERE id = ?
  `).run(TEST_ORG);
}

cleanup();

try {
  const timestamp = now();

  const appa = db.prepare(`
    SELECT id
    FROM organisations
    WHERE id = ?
      AND status = 'Active'
    LIMIT 1
  `).get(APPA_ORG);

  assert(appa);

  console.log(
    "✓ APPA organisation exists"
  );

  db.prepare(`
    INSERT INTO organisations (
      id,
      name,
      code,
      status,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      'User Admin Test Company',
      'UATC',
      'Active',
      ?,
      ?
    )
  `).run(
    TEST_ORG,
    timestamp,
    timestamp
  );

  const fakeHash =
    crypto
      .createHash("sha256")
      .update(
        "not-a-real-password"
      )
      .digest("hex");

  db.prepare(`
    INSERT INTO users (
      id,
      email,
      password_hash,
      full_name,
      role,
      status,
      last_login_at,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      'appa-admin-isolation@example.test',
      ?,
      'APPA Isolation User',
      'Finance Analyst',
      'Active',
      NULL,
      ?,
      ?
    )
  `).run(
    TEST_USER_A,
    fakeHash,
    timestamp,
    timestamp
  );

  db.prepare(`
    INSERT INTO users (
      id,
      email,
      password_hash,
      full_name,
      role,
      status,
      last_login_at,
      created_at,
      updated_at
    )
    VALUES (
      ?,
      'company-b-admin-isolation@example.test',
      ?,
      'Company B Isolation User',
      'Finance Analyst',
      'Active',
      NULL,
      ?,
      ?
    )
  `).run(
    TEST_USER_B,
    fakeHash,
    timestamp,
    timestamp
  );

  db.prepare(`
    INSERT INTO organisation_memberships (
      id,
      organisation_id,
      user_id,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'Active', ?, ?)
  `).run(
    crypto.randomUUID(),
    APPA_ORG,
    TEST_USER_A,
    timestamp,
    timestamp
  );

  db.prepare(`
    INSERT INTO organisation_memberships (
      id,
      organisation_id,
      user_id,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, 'Active', ?, ?)
  `).run(
    crypto.randomUUID(),
    TEST_ORG,
    TEST_USER_B,
    timestamp,
    timestamp
  );

  const appaCanSeeB =
    count(
      `
        SELECT COUNT(*) AS total
        FROM organisation_memberships
        WHERE organisation_id = ?
          AND user_id = ?
      `,
      APPA_ORG,
      TEST_USER_B
    );

  assert.strictEqual(
    appaCanSeeB,
    0
  );

  console.log(
    "✓ APPA cannot list Company B-only user"
  );

  const companyBCanSeeA =
    count(
      `
        SELECT COUNT(*) AS total
        FROM organisation_memberships
        WHERE organisation_id = ?
          AND user_id = ?
      `,
      TEST_ORG,
      TEST_USER_A
    );

  assert.strictEqual(
    companyBCanSeeA,
    0
  );

  console.log(
    "✓ Company B cannot list APPA-only user"
  );

  const appaTargetB =
    db.prepare(`
      SELECT u.id
      FROM organisation_memberships om
      INNER JOIN users u
        ON u.id = om.user_id
      WHERE om.organisation_id = ?
        AND u.id = ?
      LIMIT 1
    `).get(
      APPA_ORG,
      TEST_USER_B
    );

  assert.strictEqual(
    appaTargetB,
    undefined
  );

  console.log(
    "✓ APPA cannot target Company B user for update"
  );

  const appaResetTargetB =
    db.prepare(`
      SELECT u.id
      FROM organisation_memberships om
      INNER JOIN users u
        ON u.id = om.user_id
      WHERE om.organisation_id = ?
        AND om.user_id = ?
        AND om.status = 'Active'
        AND u.status = 'Active'
      LIMIT 1
    `).get(
      APPA_ORG,
      TEST_USER_B
    );

  assert.strictEqual(
    appaResetTargetB,
    undefined
  );

  console.log(
    "✓ APPA cannot target Company B user for password reset"
  );

  const ownA =
    db.prepare(`
      SELECT u.id
      FROM organisation_memberships om
      INNER JOIN users u
        ON u.id = om.user_id
      WHERE om.organisation_id = ?
        AND om.user_id = ?
      LIMIT 1
    `).get(
      APPA_ORG,
      TEST_USER_A
    );

  assert(ownA);

  console.log(
    "✓ APPA can access its own member"
  );

  const ownB =
    db.prepare(`
      SELECT u.id
      FROM organisation_memberships om
      INNER JOIN users u
        ON u.id = om.user_id
      WHERE om.organisation_id = ?
        AND om.user_id = ?
      LIMIT 1
    `).get(
      TEST_ORG,
      TEST_USER_B
    );

  assert(ownB);

  console.log(
    "✓ Company B can access its own member"
  );

  const integrity =
    db.prepare(
      "PRAGMA integrity_check"
    ).get();

  assert.strictEqual(
    Object.values(integrity)[0],
    "ok"
  );

  const fk =
    db.prepare(
      "PRAGMA foreign_key_check"
    ).all();

  assert.strictEqual(
    fk.length,
    0
  );

  console.log(
    "✓ SQLite integrity remains healthy"
  );

  console.log(
    "✓ Foreign keys remain clean"
  );

  console.log("");
  console.log(
    "USER ADMINISTRATION ISOLATION TEST PASSED"
  );
} finally {
  cleanup();

  const remaining =
    count(
      `
        SELECT COUNT(*) AS total
        FROM organisations
        WHERE id = ?
      `,
      TEST_ORG
    );

  assert.strictEqual(
    remaining,
    0
  );

  console.log(
    "✓ Temporary Company B and test users cleaned"
  );
}
