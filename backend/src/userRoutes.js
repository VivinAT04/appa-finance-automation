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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
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

    error.code =
      "ORGANISATION_REQUIRED";

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
    status:
      row.membership_status ||
      row.status,
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

async function getOrganisationUser(
  organisationId,
  userId,
  client = db
) {
  return client.one(
    `
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
      WHERE om.organisation_id = $1
        AND om.user_id = $2
      LIMIT 1
    `,
    [
      organisationId,
      userId,
    ]
  );
}

async function listUsers(
  organisationId
) {
  return db.many(
    `
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
      WHERE om.organisation_id = $1
      ORDER BY
        CASE om.status
          WHEN 'Active' THEN 0
          ELSE 1
        END,
        LOWER(u.full_name),
        LOWER(u.email)
    `,
    [organisationId]
  );
}

async function activeAdministratorCount(
  organisationId,
  client = db
) {
  const row = await client.one(
    `
      SELECT COUNT(*)::int AS total
      FROM organisation_memberships om
      INNER JOIN users u
        ON u.id = om.user_id
      WHERE om.organisation_id = $1
        AND om.status = 'Active'
        AND u.status = 'Active'
        AND u.role = 'Administrator'
    `,
    [organisationId]
  );

  return Number(row?.total || 0);
}

async function activeMembershipCount(
  userId,
  client = db
) {
  const row = await client.one(
    `
      SELECT COUNT(*)::int AS total
      FROM organisation_memberships
      WHERE user_id = $1
        AND status = 'Active'
    `,
    [userId]
  );

  return Number(row?.total || 0);
}

async function totalMembershipCount(
  userId
) {
  const row = await db.one(
    `
      SELECT COUNT(*)::int AS total
      FROM organisation_memberships
      WHERE user_id = $1
    `,
    [userId]
  );

  return Number(row?.total || 0);
}

async function writeAudit(
  organisationId,
  actorUserId,
  action,
  entityId,
  description
) {
  try {
    await db.execute(
      `
        INSERT INTO audit_logs (
          id,
          organisation_id,
          action,
          entity_type,
          entity_id,
          description,
          created_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'User',
          $4,
          $5,
          $6
        )
      `,
      [
        crypto.randomUUID(),
        organisationId,
        action,
        entityId,
        description,
        new Date().toISOString(),
      ]
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

router.get(
  "/",
  async (req, res, next) => {
    try {
      const organisationId =
        requireOrganisationId(req);

      const rows =
        await listUsers(
          organisationId
        );

      const users =
        rows.map(publicUser);

      return res.json({
        success: true,
        total: users.length,
        users,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/",
  async (req, res, next) => {
    try {
      const organisationId =
        requireOrganisationId(req);

      const fullName = String(
        req.body?.fullName || ""
      ).trim();

      const email =
        normalizeEmail(
          req.body?.email
        );

      const role = String(
        req.body?.role || ""
      ).trim();

      const password = String(
        req.body?.password || ""
      );

      if (!fullName) {
        return res.status(400).json({
          success: false,
          message:
            "Full name is required.",
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

      const existing =
        await db.one(
          `
            SELECT *
            FROM users
            WHERE LOWER(email) =
              LOWER($1)
            LIMIT 1
          `,
          [email]
        );

      const now =
        new Date().toISOString();

      if (existing) {
        const membership =
          await db.one(
            `
              SELECT *
              FROM organisation_memberships
              WHERE organisation_id = $1
                AND user_id = $2
              LIMIT 1
            `,
            [
              organisationId,
              existing.id,
            ]
          );

        if (membership) {
          return res
            .status(409)
            .json({
              success: false,
              message:
                "This user already belongs to the selected organisation.",
            });
        }

        if (
          existing.role !== role
        ) {
          return res
            .status(409)
            .json({
              success: false,
              code:
                "GLOBAL_ROLE_CONFLICT",
              message:
                `This account already exists with the global role ${existing.role}. Select that role when adding the account to another organisation.`,
            });
        }

        await db.transaction(
          async (tx) => {
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
                organisationId,
                existing.id,
                now,
                now,
              ]
            );

            if (
              existing.status !==
              ACTIVE
            ) {
              await tx.execute(
                `
                  UPDATE users
                  SET status =
                        'Active',
                      updated_at = $1
                  WHERE id = $2
                `,
                [
                  now,
                  existing.id,
                ]
              );
            }
          }
        );

        await writeAudit(
          organisationId,
          req.accessUser?.id,
          "USER_MEMBERSHIP_CREATED",
          existing.id,
          `${existing.full_name} was added to ${req.organisation.name}.`
        );

        const joined =
          await getOrganisationUser(
            organisationId,
            existing.id
          );

        return res
          .status(201)
          .json({
            success: true,
            user:
              publicUser(joined),
          });
      }

      const id =
        crypto.randomUUID();

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

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
                last_login_at,
                created_at,
                updated_at
              )
              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                'Active',
                NULL,
                $6,
                $7
              )
            `,
            [
              id,
              email,
              passwordHash,
              fullName,
              role,
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
              organisationId,
              id,
              now,
              now,
            ]
          );
        }
      );

      await writeAudit(
        organisationId,
        req.accessUser?.id,
        "USER_CREATED",
        id,
        `${fullName} was created in ${req.organisation.name} with role ${role}.`
      );

      const created =
        await getOrganisationUser(
          organisationId,
          id
        );

      return res
        .status(201)
        .json({
          success: true,
          user:
            publicUser(created),
        });
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  "/:id",
  async (req, res, next) => {
    try {
      const organisationId =
        requireOrganisationId(req);

      const id = String(
        req.params.id || ""
      ).trim();

      const existing =
        await getOrganisationUser(
          organisationId,
          id
        );

      if (!existing) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "User not found.",
          });
      }

      const nextName =
        req.body?.fullName ===
        undefined
          ? existing.full_name
          : String(
              req.body.fullName ||
                ""
            ).trim();

      const nextRole =
        req.body?.role === undefined
          ? existing.role
          : String(
              req.body.role || ""
            ).trim();

      const nextStatus =
        req.body?.status ===
        undefined
          ? existing.membership_status
          : String(
              req.body.status || ""
            ).trim();

      if (!nextName) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Full name is required.",
          });
      }

      if (
        !ROLES.includes(nextRole)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "A valid APPA role is required.",
          });
      }

      if (
        !STATUSES.includes(
          nextStatus
        )
      ) {
        return res
          .status(400)
          .json({
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
        (
          await activeAdministratorCount(
            organisationId
          )
        ) <= 1
      ) {
        return res
          .status(409)
          .json({
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
        return res
          .status(409)
          .json({
            success: false,
            message:
              "You cannot deactivate your own membership in the selected organisation.",
          });
      }

      /*
       * Roles currently live on users rather
       * than memberships. A role change
       * therefore affects the identity across
       * every organisation.
       */
      if (
        nextRole !== existing.role
      ) {
        const membershipCount =
          await totalMembershipCount(
            existing.id
          );

        if (
          membershipCount > 1
        ) {
          return res
            .status(409)
            .json({
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

      await db.transaction(
        async (tx) => {
          await tx.execute(
            `
              UPDATE users
              SET full_name = $1,
                  role = $2,
                  updated_at = $3
              WHERE id = $4
            `,
            [
              nextName,
              nextRole,
              now,
              id,
            ]
          );

          await tx.execute(
            `
              UPDATE organisation_memberships
              SET status = $1,
                  updated_at = $2
              WHERE organisation_id = $3
                AND user_id = $4
            `,
            [
              nextStatus,
              now,
              organisationId,
              id,
            ]
          );

          const remainingActive =
            await activeMembershipCount(
              id,
              tx
            );

          const nextAccountStatus =
            remainingActive > 0
              ? ACTIVE
              : INACTIVE;

          await tx.execute(
            `
              UPDATE users
              SET status = $1,
                  updated_at = $2
              WHERE id = $3
            `,
            [
              nextAccountStatus,
              now,
              id,
            ]
          );

          if (
            nextAccountStatus ===
            INACTIVE
          ) {
            await tx.execute(
              `
                UPDATE password_reset_tokens
                SET used_at = $1
                WHERE user_id = $2
                  AND used_at IS NULL
              `,
              [
                now,
                id,
              ]
            );
          }
        }
      );

      await writeAudit(
        organisationId,
        req.accessUser?.id,
        "USER_UPDATED",
        id,
        `${nextName} updated in ${req.organisation.name}: role=${nextRole}, membershipStatus=${nextStatus}.`
      );

      const updated =
        await getOrganisationUser(
          organisationId,
          id
        );

      return res.json({
        success: true,
        user:
          publicUser(updated),
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/:id/reset-password",
  async (req, res, next) => {
    try {
      const organisationId =
        requireOrganisationId(req);

      const id = String(
        req.params.id || ""
      ).trim();

      const password = String(
        req.body?.password || ""
      );

      if (
        !validPassword(password)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "Temporary password must be at least 12 characters and include uppercase, lowercase and a number.",
          });
      }

      const user =
        await getOrganisationUser(
          organisationId,
          id
        );

      if (!user) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "User not found.",
          });
      }

      if (
        user.membership_status !==
          ACTIVE ||
        user.status !== ACTIVE
      ) {
        return res
          .status(409)
          .json({
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

      await db.transaction(
        async (tx) => {
          await tx.execute(
            `
              UPDATE users
              SET password_hash = $1,
                  updated_at = $2
              WHERE id = $3
            `,
            [
              hash,
              now,
              id,
            ]
          );

          await tx.execute(
            `
              UPDATE password_reset_tokens
              SET used_at = $1
              WHERE user_id = $2
                AND used_at IS NULL
            `,
            [
              now,
              id,
            ]
          );
        }
      );

      await writeAudit(
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
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
