const crypto = require("crypto");
const db = require("./database");

const ORGANISATION_HEADER =
  "x-organisation-id";

const ROBOT_KEY_HEADER =
  "x-rpa-api-key";

function safeEqual(left, right) {
  const leftBuffer =
    Buffer.from(
      String(left || "")
    );

  const rightBuffer =
    Buffer.from(
      String(right || "")
    );

  if (
    leftBuffer.length === 0 ||
    leftBuffer.length !==
      rightBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    leftBuffer,
    rightBuffer
  );
}

async function requireRpaRobot(
  req,
  res,
  next
) {
  try {
    const configuredKey =
      process.env.RPA_API_KEY || "";

    if (
      configuredKey.length < 32
    ) {
      return res.status(503).json({
        success: false,
        code:
          "RPA_NOT_CONFIGURED",
        message:
          "RPA robot authentication is not configured.",
      });
    }

    const suppliedKey =
      String(
        req.headers[
          ROBOT_KEY_HEADER
        ] || ""
      ).trim();

    if (
      !safeEqual(
        suppliedKey,
        configuredKey
      )
    ) {
      return res.status(401).json({
        success: false,
        code:
          "RPA_AUTHENTICATION_FAILED",
        message:
          "RPA robot authentication failed.",
      });
    }

    const organisationId =
      String(
        req.headers[
          ORGANISATION_HEADER
        ] || ""
      ).trim();

    if (!organisationId) {
      return res.status(400).json({
        success: false,
        code:
          "ORGANISATION_REQUIRED",
        message:
          "X-Organisation-Id is required.",
      });
    }

    const organisation =
      await db.one(
        `
          SELECT
            id,
            name,
            code,
            status
          FROM organisations
          WHERE
            id = $1
            AND status = 'Active'
          LIMIT 1
        `,
        [organisationId]
      );

    if (!organisation) {
      return res.status(403).json({
        success: false,
        code:
          "ORGANISATION_ACCESS_DENIED",
        message:
          "The RPA robot cannot access the requested organisation.",
      });
    }

    req.rpaRobot = {
      name:
        process.env
          .RPA_ROBOT_NAME ||
        "UiPath Robot",
    };

    req.organisation = {
      id: organisation.id,
      name: organisation.name,
      code: organisation.code,
    };

    req.organisationId =
      organisation.id;

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireRpaRobot,
};
