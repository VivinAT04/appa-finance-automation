const jwt = require("jsonwebtoken");
const db = require("./database");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured and contain at least 32 characters."
    );
  }

  return secret;
}

function getCurrentUser(userId) {
  if (!userId) {
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
  `).get(userId);
}

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: "appa-finance",
      audience: "appa-finance-web",
    });

    const user = getCurrentUser(payload.sub);

    if (!user || user.status !== "Active") {
      return res.status(401).json({
        success: false,
        message: "User account is unavailable.",
      });
    }

    /*
     * IMPORTANT:
     * The database is the source of truth for mutable account data.
     * We deliberately do not trust role/status/name from an older JWT.
     */
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      status: user.status,
    };

    req.authUser = user;

    return next();
  } catch (_error) {
    return res.status(401).json({
      success: false,
      message: "Your session is invalid or has expired.",
    });
  }
}

module.exports = {
  requireAuth,
  getJwtSecret,
  getCurrentUser,
};
