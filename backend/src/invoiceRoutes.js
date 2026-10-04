const express = require("express");

const {
  processInvoiceDocument,
  getInvoiceById,
  getInvoiceByDocumentId,
  listInvoices,
} = require("./invoiceExtractionService");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const invoices = await listInvoices(req.organisation.id);
    return res.json({ success: true, invoices });
  } catch (error) {
    return next(error);
  }
});

router.get("/document/:documentId", async (req, res, next) => {
  try {
    const invoice = await getInvoiceByDocumentId(
      req.params.documentId,
      req.organisation.id
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "No extracted invoice exists for this document.",
      });
    }

    return res.json({ success: true, invoice });
  } catch (error) {
    return next(error);
  }
});

router.post("/process/:documentId", async (req, res, next) => {
  try {
    const invoice = await processInvoiceDocument(
      req.params.documentId,
      req.organisation.id
    );

    if (!invoice) {
      throw new Error(
        "Extraction finished but the invoice could not be retrieved."
      );
    }

    return res.json({
      success: true,
      message: "Invoice extraction completed.",
      invoice,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const invoice = await getInvoiceById(
      req.params.id,
      req.organisation.id
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found.",
      });
    }

    return res.json({ success: true, invoice });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
