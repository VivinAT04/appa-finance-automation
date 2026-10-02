const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const db = require("./database");

const router = express.Router();

/*
 * Local development stores uploaded documents under backend/uploads.
 *
 * Vercel serverless functions cannot write to the deployed /var/task
 * application filesystem. Their writable ephemeral filesystem is /tmp.
 * This prevents document route initialisation from crashing unrelated
 * API routes such as /api/rpa/work-items.
 */
const uploadDir =
  process.env.VERCEL
    ? path.join("/tmp", "appa-finance-uploads")
    : path.join(__dirname, "..", "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),

  filename: (_req, file, cb) => {
    const extension =
      path.extname(file.originalname).toLowerCase();

    cb(null, `${randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        new Error(
          "Only PDF, PNG and JPG documents are supported."
        )
      );
    }

    cb(null, true);
  },
});

async function createAudit(
  organisationId,
  action,
  entityType,
  entityId,
  description
) {
  await db.execute(
    `
      INSERT INTO audit_logs (
        id,
        action,
        entity_type,
        entity_id,
        description,
        created_at,
        organisation_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      randomUUID(),
      action,
      entityType,
      entityId,
      description,
      new Date().toISOString(),
      organisationId,
    ]
  );
}

router.get("/", async (req, res, next) => {
  try {
    const organisationId = req.organisation.id;

    const documents = await db.many(
      `
        SELECT
          id,
          original_name AS "originalName",
          mime_type AS "mimeType",
          size,
          document_type AS "documentType",
          status,
          extraction_status AS "extractionStatus",
          uploaded_by AS "uploadedBy",
          created_at AS "createdAt"
        FROM documents
        WHERE organisation_id = $1
        ORDER BY created_at DESC
      `,
      [organisationId]
    );

    return res.json({
      success: true,
      documents,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const organisationId = req.organisation.id;

    const document = await db.one(
      `
        SELECT
          id,
          original_name AS "originalName",
          stored_name AS "storedName",
          mime_type AS "mimeType",
          size,
          document_type AS "documentType",
          status,
          extraction_status AS "extractionStatus",
          uploaded_by AS "uploadedBy",
          created_at AS "createdAt"
        FROM documents
        WHERE id = $1
          AND organisation_id = $2
      `,
      [
        req.params.id,
        organisationId,
      ]
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    return res.json({
      success: true,
      document,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/file", async (req, res, next) => {
  try {
    const organisationId = req.organisation.id;

    const document = await db.one(
      `
        SELECT
          original_name,
          stored_name
        FROM documents
        WHERE id = $1
          AND organisation_id = $2
      `,
      [
        req.params.id,
        organisationId,
      ]
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found.",
      });
    }

    const filePath = path.join(
      uploadDir,
      document.stored_name
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "Stored file could not be found.",
      });
    }

    return res.sendFile(filePath);
  } catch (error) {
    return next(error);
  }
});

router.post(
  "/upload",

  (req, res, next) => {
    upload.single("document")(
      req,
      res,
      (error) => {
        if (error) {
          return next(error);
        }

        next();
      }
    );
  },

  async (req, res, next) => {
    try {
      if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Choose a document to upload.",
      });
    }

    const organisationId =
      req.organisation.id;

    const id = randomUUID();
    const now = new Date().toISOString();

    const requestedType =
      typeof req.body.documentType === "string"
        ? req.body.documentType.trim()
        : "";

    const documentType =
      requestedType || "Unclassified";

    const uploadedBy =
      req.user?.fullName ||
      req.user?.email ||
      "Authenticated User";

    await db.execute(
      `
        INSERT INTO documents (
          id,
          original_name,
          stored_name,
          mime_type,
          size,
          document_type,
          status,
          extraction_status,
          uploaded_by,
          created_at,
          organisation_id
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11
        )
      `,
      [
        id,
        req.file.originalname,
        req.file.filename,
        req.file.mimetype,
        req.file.size,
        documentType,
        "Uploaded",
        "Pending",
        uploadedBy,
        now,
        organisationId,
      ]
    );

    await createAudit(
      organisationId,
      "DOCUMENT_UPLOADED",
      "document",
      id,
      `${req.file.originalname} uploaded`
    );

    const document = await db.one(
      `
        SELECT
          id,
          original_name AS "originalName",
          mime_type AS "mimeType",
          size,
          document_type AS "documentType",
          status,
          extraction_status AS "extractionStatus",
          uploaded_by AS "uploadedBy",
          created_at AS "createdAt"
        FROM documents
        WHERE id = $1
          AND organisation_id = $2
      `,
      [
        id,
        organisationId,
      ]
    );

    return res.status(201).json({
      success: true,
      document,
    });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;
