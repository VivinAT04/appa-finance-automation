const express = require("express");
const db = require("./database");

const router = express.Router();

router.get("/", (req, res) => {
  const organisationId =
    req.organisation.id;

  const logs = db.prepare(`
    SELECT
      id,
      action,
      entity_type AS entityType,
      entity_id AS entityId,
      description,
      created_at AS createdAt
    FROM audit_logs
    WHERE organisation_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(organisationId);

  res.json({
    success: true,
    logs,
  });
});

module.exports = router;
