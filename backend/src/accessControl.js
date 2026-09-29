const db = require("./database");

const ROLES = Object.freeze([
  "Administrator",
  "Finance Manager",
  "Finance Analyst",
  "Approver",
  "Auditor",
]);

const ROLE_CAPABILITIES = Object.freeze({
  Administrator: [
    "users.manage",
    "settings.manage",
    "finance.read",
    "finance.operate",
    "finance.approve",
    "audit.read",
  ],

  "Finance Manager": [
    "settings.manage",
    "finance.read",
    "finance.operate",
    "finance.approve",
    "audit.read",
  ],

  "Finance Analyst": [
    "finance.read",
    "finance.operate",
  ],

  Approver: [
    "finance.read",
    "finance.approve",
  ],

  Auditor: [
    "finance.read",
    "audit.read",
  ],
});

function getCurrentDatabaseUser(req) {
  if (!req.user?.id) {
    return null;
  }

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
    WHERE id = ?
    LIMIT 1
  `).get(req.user.id);
}

function hasCapability(role, capability) {
  return (
    ROLE_CAPABILITIES[role] || []
  ).includes(capability);
}

function requireCapability(capability) {
  return (req, res, next) => {
    const user = getCurrentDatabaseUser(req);

    if (!user || user.status !== "Active") {
      return res.status(401).json({
        success: false,
        message: "User account is unavailable.",
      });
    }

    if (!hasCapability(user.role, capability)) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to perform this action.",
      });
    }

    req.accessUser = user;

    return next();
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    const user = getCurrentDatabaseUser(req);

    if (!user || user.status !== "Active") {
      return res.status(401).json({
        success: false,
        message: "User account is unavailable.",
      });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to perform this action.",
      });
    }

    req.accessUser = user;

    return next();
  };
}

module.exports = {
  ROLES,
  ROLE_CAPABILITIES,
  hasCapability,
  requireCapability,
  requireRole,
};
