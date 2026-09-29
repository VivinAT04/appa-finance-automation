const express = require("express");

const {
  processInvoiceDocument,
  getInvoiceById,
  getInvoiceByDocumentId,
  listInvoices,
} = require("./invoiceExtractionService");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({
    success: true,
    invoices: listInvoices(),
  });
});

router.get("/document/:documentId", (req, res) => {
  const invoice = getInvoiceByDocumentId(
    req.params.documentId
  );

  if (!invoice) {
    return res.status(404).json({
      success: false,
      message:
        "No extracted invoice exists for this document.",
    });
  }

  res.json({
    success: true,
    invoice,
  });
});

router.post(
  "/process/:documentId",
  async (req, res, next) => {
    try {
      const invoice =
        await processInvoiceDocument(
          req.params.documentId
        );

      res.json({
        success: true,
        message:
          "Invoice extraction completed.",
        invoice,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get("/:id", (req, res) => {
  const invoice = getInvoiceById(
    req.params.id
  );

  if (!invoice) {
    return res.status(404).json({
      success: false,
      message: "Invoice not found.",
    });
  }

  res.json({
    success: true,
    invoice,
  });
});

module.exports = router;
