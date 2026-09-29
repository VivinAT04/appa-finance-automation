const db = require("./database");

const ORGANISATION_HEADER = "x-organisation-id";

function listActiveOrganisationsForUser(userId) {
  if (!userId) {
    return [];
  }

  return db.prepare(`
    SELECT
      o.id,
      o.name,
      o.code,
      o.status
    FROM organisation_memberships om
    INNER JOIN organisations o
      ON o.id = om.organisation_id
    WHERE om.user_id = ?
      AND om.status = 'Active'
      AND o.status = 'Active'
    ORDER BY o.name ASC
  `).all(userId);
}

function getActiveOrganisationForUser(
  userId,
  organisationId
) {
  if (!userId || !organisationId) {
    return null;
  }

  return db.prepare(`
    SELECT
      o.id,
      o.name,
      o.code,
      o.status
    FROM organisation_memberships om
    INNER JOIN organisations o
      ON o.id = om.organisation_id
    WHERE om.user_id = ?
      AND om.organisation_id = ?
      AND om.status = 'Active'
      AND o.status = 'Active'
    LIMIT 1
  `).get(userId, organisationId);
}

function requireOrganisation(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }

  const organisationId = String(
    req.headers[ORGANISATION_HEADER] || ""
  ).trim();

  if (!organisationId) {
    return res.status(400).json({
      success: false,
      code: "ORGANISATION_REQUIRED",
      message:
        "Select an organisation before accessing finance data.",
    });
  }

  const organisation =
    getActiveOrganisationForUser(
      req.user.id,
      organisationId
    );

  if (!organisation) {
    return res.status(403).json({
      success: false,
      code: "ORGANISATION_ACCESS_DENIED",
      message:
        "You do not have access to the selected organisation.",
    });
  }

  req.organisation = {
    id: organisation.id,
    name: organisation.name,
    code: organisation.code,
  };

  req.organisationId = organisation.id;

  return next();
}

module.exports = {
  ORGANISATION_HEADER,
  listActiveOrganisationsForUser,
  getActiveOrganisationForUser,
  requireOrganisation,
};
