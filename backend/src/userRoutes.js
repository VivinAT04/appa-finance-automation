const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const db = require("./database");
const {
  ROLES,
  ROLE_CAPABILITIES,
  requireCapability,
} = require("./accessControl");

const router = express.Router();

const ACTIVE = "Active";
const INACTIVE = "Inactive";
const STATUSES = [ACTIVE, INACTIVE];

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listUsers() {
  return db.prepare(`
    SELECT
      id,
      email,
      full_name,
      role,
      status,
      last_login_at,
      created_at,
      updated_at
    FROM users
    ORDER BY
      CASE status
        WHEN 'Active' THEN 0
        ELSE 1
      END,
      full_name COLLATE NOCASE,
      email COLLATE NOCASE
  `).all();
}

function activeAdministratorCount() {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM users
    WHERE role = 'Administrator'
      AND status = 'Active'
  `).get();

  return Number(row?.total || 0);
}

function writeAudit(action, entityId, description) {
  const columns = db
    .prepare("PRAGMA table_info(audit_logs)")
    .all()
    .map((column) => column.name);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const values = {
    id,
    action,
    entity_type: "User",
    entity_id: entityId,
    description,
    performed_by: "APPA Administrator",
    created_at: now,
    timestamp: now,
    event_type: action,
    details: description,
    user_id: entityId,
  };

  const supported = Object.keys(values).filter(
    (key) => columns.includes(key)
  );

  if (
    !supported.includes("id") ||
    supported.length < 2
  ) {
    return;
  }

  const placeholders =
    supported.map(() => "?").join(", ");

  const sql = `
    INSERT INTO audit_logs (
      ${supported.join(", ")}
    )
    VALUES (${placeholders})
  `;

  try {
    db.prepare(sql).run(
      ...supported.map((key) => values[key])
    );
  } catch (error) {
    console.warn(
      "APPA user audit event could not be recorded:",
      error.message
    );
  }
}

router.use(
  requireCapability("users.manage")
);

router.get("/roles", (_req, res) => {
  return res.json({
    success: true,
    roles: ROLES.map((role) => ({
      name: role,
      capabilities:
        ROLE_CAPABILITIES[role] || [],
    })),
  });
});

router.get("/", (_req, res) => {
  const users =
    listUsers().map(publicUser);

  return res.json({
    success: true,
    total: users.length,
    users,
  });
});

router.post("/", async (req, res) => {
  const fullName =
    String(req.body?.fullName || "").trim();

  const email =
    normalizeEmail(req.body?.email);

  const role =
    String(req.body?.role || "").trim();

  const password =
    String(req.body?.password || "");

  if (!fullName) {
    return res.status(400).json({
      success: false,
      message: "Full name is required.",
    });
  }

  if (!validEmail(email)) {
    return res.status(400).json({
      success: false,
      message: "A valid email address is required.",
    });
  }

  if (!ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "A valid APPA role is required.",
    });
  }

  if (!validPassword(password)) {
    return res.status(400).json({
      success: false,
      message:
        "Temporary password must be at least 12 characters and include uppercase, lowercase and a number.",
    });
  }

  const existing = db.prepare(`
    SELECT id
    FROM users
    WHERE email = ?
    LIMIT 1
  `).get(email);

  if (existing) {
    return res.status(409).json({
      success: false,
      message:
        "An APPA user with this email already exists.",
    });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const passwordHash =
    await bcrypt.hash(password, 12);

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
    VALUES (?, ?, ?, ?, ?, 'Active', NULL, ?, ?)
  `).run(
    id,
    email,
    passwordHash,
    fullName,
    role,
    now,
    now
  );

  writeAudit(
    "USER_CREATED",
    id,
    `${fullName} was created with role ${role}.`
  );

  const created = db.prepare(`
    SELECT
      id,
      email,
      full_name,
      role,
      status,
      last_login_at,
      created_at,
      updated_at
    FROM users
    WHERE id = ?
  `).get(id);

  return res.status(201).json({
    success: true,
    user: publicUser(created),
  });
});

router.patch("/:id", (req, res) => {
  const id =
    String(req.params.id || "").trim();

  const existing = db.prepare(`
    SELECT *
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(id);

  if (!existing) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const nextName =
    req.body?.fullName === undefined
      ? existing.full_name
      : String(req.body.fullName || "").trim();

  const nextRole =
    req.body?.role === undefined
      ? existing.role
      : String(req.body.role || "").trim();

  const nextStatus =
    req.body?.status === undefined
      ? existing.status
      : String(req.body.status || "").trim();

  if (!nextName) {
    return res.status(400).json({
      success: false,
      message: "Full name is required.",
    });
  }

  if (!ROLES.includes(nextRole)) {
    return res.status(400).json({
      success: false,
      message: "A valid APPA role is required.",
    });
  }

  if (!STATUSES.includes(nextStatus)) {
    return res.status(400).json({
      success: false,
      message: "A valid account status is required.",
    });
  }

  const removingActiveAdministrator =
    existing.role === "Administrator" &&
    existing.status === ACTIVE &&
    (
      nextRole !== "Administrator" ||
      nextStatus !== ACTIVE
    );

  if (
    removingActiveAdministrator &&
    activeAdministratorCount() <= 1
  ) {
    return res.status(409).json({
      success: false,
      message:
        "APPA must retain at least one active Administrator.",
    });
  }

  if (
    req.accessUser?.id === existing.id &&
    nextStatus !== ACTIVE
  ) {
    return res.status(409).json({
      success: false,
      message:
        "You cannot deactivate your own signed-in account.",
    });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET
      full_name = ?,
      role = ?,
      status = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    nextName,
    nextRole,
    nextStatus,
    now,
    id
  );

  if (nextStatus === INACTIVE) {
    db.prepare(`
      UPDATE password_reset_tokens
      SET used_at = ?
      WHERE user_id = ?
        AND used_at IS NULL
    `).run(now, id);
  }

  writeAudit(
    "USER_UPDATED",
    id,
    `${nextName} updated: role=${nextRole}, status=${nextStatus}.`
  );

  const updated = db.prepare(`
    SELECT
      id,
      email,
      full_name,
      role,
      status,
      last_login_at,
      created_at,
      updated_at
    FROM users
    WHERE id = ?
  `).get(id);

  return res.json({
    success: true,
    user: publicUser(updated),
  });
});

router.post(
  "/:id/reset-password",
  async (req, res) => {
    const id =
      String(req.params.id || "").trim();

    const password =
      String(req.body?.password || "");

    if (!validPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Temporary password must be at least 12 characters and include uppercase, lowercase and a number.",
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const hash =
      await bcrypt.hash(password, 12);

    const now =
      new Date().toISOString();

    const transaction =
      db.transaction(() => {
        db.prepare(`
          UPDATE users
          SET
            password_hash = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          hash,
          now,
          id
        );

        db.prepare(`
          UPDATE password_reset_tokens
          SET used_at = ?
          WHERE user_id = ?
            AND used_at IS NULL
        `).run(
          now,
          id
        );
      });

    transaction();

    writeAudit(
      "USER_PASSWORD_ADMIN_RESET",
      id,
      `An Administrator reset the password for ${user.full_name}.`
    );

    return res.json({
      success: true,
      message:
        "Temporary password updated successfully.",
    });
  }
);

module.exports = router;
