const jwt = require("jsonwebtoken");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured and contain at least 32 characters."
    );
  }

  return secret;
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
    });

    req.user = {
      id: payload.sub,
      email: payload.email,
      fullName: payload.fullName,
      role: payload.role,
    };

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
};
