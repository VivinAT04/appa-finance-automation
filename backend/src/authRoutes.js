const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("./database");
const {
  requireAuth,
  getJwtSecret,
} = require("./authMiddleware");

const router = express.Router();

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    status: row.status,
    lastLoginAt: row.last_login_at,
  };
}

function audit(action, userId, description) {
  db.prepare(`
    INSERT INTO audit_logs (
      id,
      action,
      entity_type,
      entity_id,
      description,
      created_at
    )
    VALUES (?, ?, 'Authentication', ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    action,
    userId || null,
    description,
    new Date().toISOString()
  );
}

router.post("/login", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required.",
    });
  }

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
    LIMIT 1
  `).get(email);

  if (!user) {
    audit(
      "AUTH_LOGIN_FAILED",
      null,
      `Failed sign-in attempt for ${email}.`
    );

    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  if (user.status !== "Active") {
    audit(
      "AUTH_LOGIN_BLOCKED",
      user.id,
      `Sign-in blocked for inactive account ${user.email}.`
    );

    return res.status(403).json({
      success: false,
      message: "This account is not active.",
    });
  }

  const valid = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!valid) {
    audit(
      "AUTH_LOGIN_FAILED",
      user.id,
      `Failed sign-in attempt for ${user.email}.`
    );

    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE users
    SET last_login_at = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, now, user.id);

  const token = jwt.sign(
    {
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
    getJwtSecret(),
    {
      algorithm: "HS256",
      subject: user.id,
      expiresIn: "8h",
      issuer: "appa-finance",
      audience: "appa-finance-web",
    }
  );

  audit(
    "AUTH_LOGIN_SUCCESS",
    user.id,
    `${user.full_name} signed in successfully.`
  );

  return res.json({
    success: true,
    token,
    user: {
      ...publicUser(user),
      lastLoginAt: now,
    },
  });
});

function hashResetToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function validNewPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
  );
}

router.post("/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email address is required.",
    });
  }

  const genericMessage =
    "If an active account exists for that email, password recovery instructions have been created.";

  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE email = ?
    LIMIT 1
  `).get(email);

  if (!user || user.status !== "Active") {
    audit(
      "AUTH_PASSWORD_RESET_REQUEST",
      user?.id || null,
      "Password recovery requested."
    );

    return res.json({
      success: true,
      message: genericMessage,
    });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 15 * 60 * 1000
  ).toISOString();

  db.prepare(`
    UPDATE password_reset_tokens
    SET used_at = ?
    WHERE user_id = ?
      AND used_at IS NULL
  `).run(now.toISOString(), user.id);

  db.prepare(`
    INSERT INTO password_reset_tokens (
      id,
      user_id,
      token_hash,
      expires_at,
      used_at,
      created_at
    )
    VALUES (?, ?, ?, ?, NULL, ?)
  `).run(
    crypto.randomUUID(),
    user.id,
    tokenHash,
    expiresAt,
    now.toISOString()
  );

  audit(
    "AUTH_PASSWORD_RESET_REQUEST",
    user.id,
    `${user.full_name} requested password recovery.`
  );

  const response = {
    success: true,
    message: genericMessage,
  };

  /*
   * No email provider is configured yet.
   * Development mode may expose the raw reset token so
   * the recovery workflow can be tested locally.
   * Production must deliver this token out-of-band.
   */
  if (process.env.NODE_ENV !== "production") {
    response.developmentResetToken = rawToken;
    response.expiresAt = expiresAt;
  }

  return res.json(response);
});

router.post("/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");

  if (!token || !password) {
    return res.status(400).json({
      success: false,
      message: "Reset token and new password are required.",
    });
  }

  if (!validNewPassword(password)) {
    return res.status(400).json({
      success: false,
      message:
        "Password must be at least 12 characters and include uppercase, lowercase and a number.",
    });
  }

  const tokenHash = hashResetToken(token);

  const reset = db.prepare(`
    SELECT
      prt.*,
      u.email,
      u.full_name,
      u.status
    FROM password_reset_tokens prt
    JOIN users u
      ON u.id = prt.user_id
    WHERE prt.token_hash = ?
    LIMIT 1
  `).get(tokenHash);

  if (
    !reset ||
    reset.used_at ||
    reset.status !== "Active" ||
    new Date(reset.expires_at).getTime() <= Date.now()
  ) {
    return res.status(400).json({
      success: false,
      message: "This password reset link is invalid or has expired.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date().toISOString();

  const updatePassword = db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      passwordHash,
      now,
      reset.user_id
    );

    db.prepare(`
      UPDATE password_reset_tokens
      SET used_at = ?
      WHERE user_id = ?
        AND used_at IS NULL
    `).run(now, reset.user_id);
  });

  updatePassword();

  audit(
    "AUTH_PASSWORD_RESET_SUCCESS",
    reset.user_id,
    `${reset.full_name} reset their password successfully.`
  );

  return res.json({
    success: true,
    message:
      "Password updated successfully. You can now sign in.",
  });
});

router.post(
  "/change-password",
  requireAuth,
  async (req, res) => {
    const currentPassword =
      String(req.body?.currentPassword || "");

    const newPassword =
      String(req.body?.newPassword || "");

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Current password and new password are required.",
      });
    }

    if (!validNewPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 12 characters and include uppercase, lowercase and a number.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message:
          "Your new password must be different from your current password.",
      });
    }

    const user = db.prepare(`
      SELECT *
      FROM users
      WHERE id = ?
      LIMIT 1
    `).get(req.user.id);

    if (!user || user.status !== "Active") {
      return res.status(401).json({
        success: false,
        message: "User account is unavailable.",
      });
    }

    const valid =
      await bcrypt.compare(
        currentPassword,
        user.password_hash
      );

    if (!valid) {
      audit(
        "AUTH_PASSWORD_CHANGE_FAILED",
        user.id,
        `${user.full_name} supplied an incorrect current password.`
      );

      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    const hash =
      await bcrypt.hash(newPassword, 12);

    const now = new Date().toISOString();

    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          updated_at = ?
      WHERE id = ?
    `).run(hash, now, user.id);

    db.prepare(`
      UPDATE password_reset_tokens
      SET used_at = ?
      WHERE user_id = ?
        AND used_at IS NULL
    `).run(now, user.id);

    audit(
      "AUTH_PASSWORD_CHANGE_SUCCESS",
      user.id,
      `${user.full_name} changed their password successfully.`
    );

    return res.json({
      success: true,
      message: "Password changed successfully.",
    });
  }
);

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT *
    FROM users
    WHERE id = ?
    LIMIT 1
  `).get(req.user.id);

  if (!user || user.status !== "Active") {
    return res.status(401).json({
      success: false,
      message: "User account is unavailable.",
    });
  }

  return res.json({
    success: true,
    user: publicUser(user),
  });
});

router.post("/logout", requireAuth, (req, res) => {
  audit(
    "AUTH_LOGOUT",
    req.user.id,
    `${req.user.fullName || req.user.email} signed out.`
  );

  return res.json({
    success: true,
  });
});

module.exports = router;
