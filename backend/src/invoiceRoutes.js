const express = require("express");

const {
  processInvoiceDocument,
  getInvoiceById,
  getInvoiceByDocumentId,
  listInvoices,
} = require("./invoiceExtractionService");

const router = express.Router();

router.get("/", (req, res) => {
  const organisationId =
    req.organisation.id;

  res.json({
    success: true,
    invoices: listInvoices(
      organisationId
    ),
  });
});

router.get(
  "/document/:documentId",
  (req, res) => {
    const organisationId =
      req.organisation.id;

    const invoice =
      getInvoiceByDocumentId(
        req.params.documentId,
        organisationId
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
  }
);

router.post(
  "/process/:documentId",
  async (req, res, next) => {
    try {
      const organisationId =
        req.organisation.id;

      const invoice =
        await processInvoiceDocument(
          req.params.documentId,
          organisationId
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
  const organisationId =
    req.organisation.id;

  const invoice = getInvoiceById(
    req.params.id,
    organisationId
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
