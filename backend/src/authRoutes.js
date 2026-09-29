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
