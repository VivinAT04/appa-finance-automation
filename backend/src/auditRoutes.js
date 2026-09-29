const express = require("express");
const db = require("./database");

const router = express.Router();

router.get("/", (_req, res) => {
  const logs = db.prepare(`
    SELECT
      id,
      action,
      entity_type AS entityType,
      entity_id AS entityId,
      description,
      created_at AS createdAt
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  res.json({
    success: true,
    logs,
  });
});

module.exports = router;
