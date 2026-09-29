const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const db = require("./database");

const router = express.Router();

const uploadDir = path.join(__dirname, "..", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
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
        new Error("Only PDF, PNG and JPG documents are supported.")
      );
    }

    cb(null, true);
  },
});

function createAudit(action, entityType, entityId, description) {
  db.prepare(`
    INSERT INTO audit_logs (
      id,
      action,
      entity_type,
      entity_id,
      description,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    action,
    entityType,
    entityId,
    description,
    new Date().toISOString()
  );
}

router.get("/", (_req, res) => {
  const documents = db.prepare(`
    SELECT
      id,
      original_name AS originalName,
      mime_type AS mimeType,
      size,
      document_type AS documentType,
      status,
      extraction_status AS extractionStatus,
      uploaded_by AS uploadedBy,
      created_at AS createdAt
    FROM documents
    ORDER BY created_at DESC
  `).all();

  res.json({
    success: true,
    documents,
  });
});

router.get("/:id", (req, res) => {
  const document = db.prepare(`
    SELECT
      id,
      original_name AS originalName,
      stored_name AS storedName,
      mime_type AS mimeType,
      size,
      document_type AS documentType,
      status,
      extraction_status AS extractionStatus,
      uploaded_by AS uploadedBy,
      created_at AS createdAt
    FROM documents
    WHERE id = ?
  `).get(req.params.id);

  if (!document) {
    return res.status(404).json({
      success: false,
      message: "Document not found.",
    });
  }

  res.json({
    success: true,
    document,
  });
});

router.get("/:id/file", (req, res) => {
  const document = db.prepare(`
    SELECT original_name, stored_name
    FROM documents
    WHERE id = ?
  `).get(req.params.id);

  if (!document) {
    return res.status(404).json({
      success: false,
      message: "Document not found.",
    });
  }

  const filePath = path.join(uploadDir, document.stored_name);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: "Stored file could not be found.",
    });
  }

  res.sendFile(filePath);
});

router.post(
  "/upload",
  (req, res, next) => {
    upload.single("document")(req, res, (error) => {
      if (error) {
        return next(error);
      }

      next();
    });
  },
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Choose a document to upload.",
      });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const requestedType =
      typeof req.body.documentType === "string"
        ? req.body.documentType.trim()
        : "";

    const documentType = requestedType || "Unclassified";

    db.prepare(`
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
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.file.originalname,
      req.file.filename,
      req.file.mimetype,
      req.file.size,
      documentType,
      "Uploaded",
      "Pending",
      "Administrator",
      now
    );

    createAudit(
      "DOCUMENT_UPLOADED",
      "document",
      id,
      `${req.file.originalname} uploaded`
    );

    const document = db.prepare(`
      SELECT
        id,
        original_name AS originalName,
        mime_type AS mimeType,
        size,
        document_type AS documentType,
        status,
        extraction_status AS extractionStatus,
        uploaded_by AS uploadedBy,
        created_at AS createdAt
      FROM documents
      WHERE id = ?
    `).get(id);

    res.status(201).json({
      success: true,
      document,
    });
  }
);

module.exports = router;
