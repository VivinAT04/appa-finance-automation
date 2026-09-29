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

function requireOrganisationId(req) {
  const organisationId = String(
    req.organisation?.id ||
      req.organisationId ||
      ""
  ).trim();

  if (!organisationId) {
    const error = new Error(
      "Organisation context is required."
    );

    error.code = "ORGANISATION_REQUIRED";

    throw error;
  }

  return organisationId;
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.membership_status || row.status,
    accountStatus: row.status,
    membershipStatus:
      row.membership_status || null,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt:
      row.membership_updated_at ||
      row.updated_at,
  };
}

function getOrganisationUser(
  organisationId,
  userId
) {
  return db.prepare(`
    SELECT
      u.id,
      u.email,
      u.password_hash,
      u.full_name,
      u.role,
      u.status,
      u.last_login_at,
      u.created_at,
      u.updated_at,
      om.id AS membership_id,
      om.status AS membership_status,
      om.created_at AS membership_created_at,
      om.updated_at AS membership_updated_at
    FROM organisation_memberships om
    INNER JOIN users u
      ON u.id = om.user_id
    WHERE om.organisation_id = ?
      AND om.user_id = ?
    LIMIT 1
  `).get(
    organisationId,
    userId
  );
}

function listUsers(organisationId) {
  return db.prepare(`
    SELECT
      u.id,
      u.email,
      u.full_name,
      u.role,
      u.status,
      u.last_login_at,
      u.created_at,
      u.updated_at,
      om.status AS membership_status,
      om.updated_at AS membership_updated_at
    FROM organisation_memberships om
    INNER JOIN users u
      ON u.id = om.user_id
    WHERE om.organisation_id = ?
    ORDER BY
      CASE om.status
        WHEN 'Active' THEN 0
        ELSE 1
      END,
      u.full_name COLLATE NOCASE,
      u.email COLLATE NOCASE
  `).all(organisationId);
}

function activeAdministratorCount(
  organisationId
) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM organisation_memberships om
    INNER JOIN users u
      ON u.id = om.user_id
    WHERE om.organisation_id = ?
      AND om.status = 'Active'
      AND u.status = 'Active'
      AND u.role = 'Administrator'
  `).get(organisationId);

  return Number(row?.total || 0);
}

function activeMembershipCount(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total
    FROM organisation_memberships
    WHERE user_id = ?
      AND status = 'Active'
  `).get(userId);

  return Number(row?.total || 0);
}

function writeAudit(
  organisationId,
  actorUserId,
  action,
  entityId,
  description
) {
  const columns = db
    .prepare("PRAGMA table_info(audit_logs)")
    .all()
    .map((column) => column.name);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const values = {
    id,
    organisation_id: organisationId,
    action,
    entity_type: "User",
    entity_id: entityId,
    description,
    performed_by:
      actorUserId || "APPA Administrator",
    created_at: now,
    timestamp: now,
    event_type: action,
    details: description,
    user_id: actorUserId || null,
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
      ...supported.map(
        (key) => values[key]
      )
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

router.get("/", (req, res) => {
  const organisationId =
    requireOrganisationId(req);

  const users =
    listUsers(organisationId).map(
      publicUser
    );

  return res.json({
    success: true,
    total: users.length,
    users,
  });
});

router.post("/", async (req, res) => {
  const organisationId =
    requireOrganisationId(req);

  const fullName =
    String(
      req.body?.fullName || ""
    ).trim();

  const email =
    normalizeEmail(req.body?.email);

  const role =
    String(
      req.body?.role || ""
    ).trim();

  const password =
    String(
      req.body?.password || ""
    );

  if (!fullName) {
    return res.status(400).json({
      success: false,
      message: "Full name is required.",
    });
  }

  if (!validEmail(email)) {
    return res.status(400).json({
      success: false,
      message:
        "A valid email address is required.",
    });
  }

  if (!ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      message:
        "A valid APPA role is required.",
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
    SELECT *
    FROM users
    WHERE email = ?
    LIMIT 1
  `).get(email);

  const now = new Date().toISOString();

  if (existing) {
    const membership = db.prepare(`
      SELECT *
      FROM organisation_memberships
      WHERE organisation_id = ?
        AND user_id = ?
      LIMIT 1
    `).get(
      organisationId,
      existing.id
    );

    if (membership) {
      return res.status(409).json({
        success: false,
        message:
          "This user already belongs to the selected organisation.",
      });
    }

    if (existing.role !== role) {
      return res.status(409).json({
        success: false,
        code:
          "GLOBAL_ROLE_CONFLICT",
        message:
          `This account already exists with the global role ${existing.role}. Select that role when adding the account to another organisation.`,
      });
    }

    const addMembership =
      db.transaction(() => {
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
          organisationId,
          existing.id,
          now,
          now
        );

        if (
          existing.status !== ACTIVE
        ) {
          db.prepare(`
            UPDATE users
            SET status = 'Active',
                updated_at = ?
            WHERE id = ?
          `).run(
            now,
            existing.id
          );
        }
      });

    addMembership();

    writeAudit(
      organisationId,
      req.accessUser?.id,
      "USER_MEMBERSHIP_CREATED",
      existing.id,
      `${existing.full_name} was added to ${req.organisation.name}.`
    );

    const joined =
      getOrganisationUser(
        organisationId,
        existing.id
      );

    return res.status(201).json({
      success: true,
      user: publicUser(joined),
    });
  }

  const id = crypto.randomUUID();

  const passwordHash =
    await bcrypt.hash(
      password,
      12
    );

  const createUser =
    db.transaction(() => {
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
          ?, ?, ?, ?, ?,
          'Active',
          NULL,
          ?, ?
        )
      `).run(
        id,
        email,
        passwordHash,
        fullName,
        role,
        now,
        now
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
        VALUES (
          ?, ?, ?, 'Active', ?, ?
        )
      `).run(
        crypto.randomUUID(),
        organisationId,
        id,
        now,
        now
      );
    });

  createUser();

  writeAudit(
    organisationId,
    req.accessUser?.id,
    "USER_CREATED",
    id,
    `${fullName} was created in ${req.organisation.name} with role ${role}.`
  );

  const created =
    getOrganisationUser(
      organisationId,
      id
    );

  return res.status(201).json({
    success: true,
    user: publicUser(created),
  });
});

router.patch("/:id", (req, res) => {
  const organisationId =
    requireOrganisationId(req);

  const id =
    String(
      req.params.id || ""
    ).trim();

  const existing =
    getOrganisationUser(
      organisationId,
      id
    );

  if (!existing) {
    return res.status(404).json({
      success: false,
      message: "User not found.",
    });
  }

  const nextName =
    req.body?.fullName === undefined
      ? existing.full_name
      : String(
          req.body.fullName || ""
        ).trim();

  const nextRole =
    req.body?.role === undefined
      ? existing.role
      : String(
          req.body.role || ""
        ).trim();

  const nextStatus =
    req.body?.status === undefined
      ? existing.membership_status
      : String(
          req.body.status || ""
        ).trim();

  if (!nextName) {
    return res.status(400).json({
      success: false,
      message: "Full name is required.",
    });
  }

  if (!ROLES.includes(nextRole)) {
    return res.status(400).json({
      success: false,
      message:
        "A valid APPA role is required.",
    });
  }

  if (!STATUSES.includes(nextStatus)) {
    return res.status(400).json({
      success: false,
      message:
        "A valid membership status is required.",
    });
  }

  const removingActiveAdministrator =
    existing.role ===
      "Administrator" &&
    existing.status === ACTIVE &&
    existing.membership_status ===
      ACTIVE &&
    (
      nextRole !==
        "Administrator" ||
      nextStatus !== ACTIVE
    );

  if (
    removingActiveAdministrator &&
    activeAdministratorCount(
      organisationId
    ) <= 1
  ) {
    return res.status(409).json({
      success: false,
      message:
        `${req.organisation.name} must retain at least one active Administrator.`,
    });
  }

  if (
    req.accessUser?.id ===
      existing.id &&
    nextStatus !== ACTIVE
  ) {
    return res.status(409).json({
      success: false,
      message:
        "You cannot deactivate your own membership in the selected organisation.",
    });
  }

  /*
   * Roles currently live on users rather than memberships.
   * Therefore a role change affects the same identity in every
   * organisation. Block 14C.1 keeps this existing model explicit
   * rather than silently pretending roles are tenant-specific.
   */
  if (
    nextRole !== existing.role
  ) {
    const membershipCount =
      db.prepare(`
        SELECT COUNT(*) AS total
        FROM organisation_memberships
        WHERE user_id = ?
      `).get(existing.id);

    if (
      Number(
        membershipCount?.total || 0
      ) > 1
    ) {
      return res.status(409).json({
        success: false,
        code:
          "GLOBAL_ROLE_CONFLICT",
        message:
          "This user belongs to multiple organisations. Role changes are blocked until organisation-specific roles are introduced.",
      });
    }
  }

  const now =
    new Date().toISOString();

  const updateUser =
    db.transaction(() => {
      db.prepare(`
        UPDATE users
        SET full_name = ?,
            role = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        nextName,
        nextRole,
        now,
        id
      );

      db.prepare(`
        UPDATE organisation_memberships
        SET status = ?,
            updated_at = ?
        WHERE organisation_id = ?
          AND user_id = ?
      `).run(
        nextStatus,
        now,
        organisationId,
        id
      );

      const remainingActive =
        activeMembershipCount(id);

      const nextAccountStatus =
        remainingActive > 0
          ? ACTIVE
          : INACTIVE;

      db.prepare(`
        UPDATE users
        SET status = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        nextAccountStatus,
        now,
        id
      );

      if (
        nextAccountStatus ===
        INACTIVE
      ) {
        db.prepare(`
          UPDATE password_reset_tokens
          SET used_at = ?
          WHERE user_id = ?
            AND used_at IS NULL
        `).run(
          now,
          id
        );
      }
    });

  updateUser();

  writeAudit(
    organisationId,
    req.accessUser?.id,
    "USER_UPDATED",
    id,
    `${nextName} updated in ${req.organisation.name}: role=${nextRole}, membershipStatus=${nextStatus}.`
  );

  const updated =
    getOrganisationUser(
      organisationId,
      id
    );

  return res.json({
    success: true,
    user: publicUser(updated),
  });
});

router.post(
  "/:id/reset-password",
  async (req, res) => {
    const organisationId =
      requireOrganisationId(req);

    const id =
      String(
        req.params.id || ""
      ).trim();

    const password =
      String(
        req.body?.password || ""
      );

    if (!validPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Temporary password must be at least 12 characters and include uppercase, lowercase and a number.",
      });
    }

    const user =
      getOrganisationUser(
        organisationId,
        id
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (
      user.membership_status !==
        ACTIVE ||
      user.status !== ACTIVE
    ) {
      return res.status(409).json({
        success: false,
        message:
          "Only active users in the selected organisation can have their password reset.",
      });
    }

    const hash =
      await bcrypt.hash(
        password,
        12
      );

    const now =
      new Date().toISOString();

    const transaction =
      db.transaction(() => {
        db.prepare(`
          UPDATE users
          SET password_hash = ?,
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
      organisationId,
      req.accessUser?.id,
      "USER_PASSWORD_ADMIN_RESET",
      id,
      `An Administrator reset the password for ${user.full_name} in ${req.organisation.name}.`
    );

    return res.json({
      success: true,
      message:
        "Temporary password updated successfully.",
    });
  }
);

module.exports = router;
