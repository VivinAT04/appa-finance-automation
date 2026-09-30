const express = require("express");
const db = require("./database");

const router = express.Router();

router.get(
  "/",
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const logs =
        await db.many(
          `
            SELECT
              id,
              action,
              entity_type AS "entityType",
              entity_id AS "entityId",
              description,
              created_at AS "createdAt"
            FROM audit_logs
            WHERE organisation_id = $1
            ORDER BY created_at DESC
            LIMIT 100
          `,
          [organisationId]
        );

      return res.json({
        success: true,
        logs,
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
