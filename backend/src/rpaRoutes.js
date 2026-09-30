const express =
  require("express");

const {
  QUEUE_NAME,
  listQueueCandidates,
  buildQueueTransaction,
  recordRobotResult,
} = require(
  "./rpaTransactionService"
);

const router =
  express.Router();

router.get(
  "/health",
  (req, res) => {
    res.json({
      success: true,
      integration:
        "APPA UiPath RPA",
      robot:
        req.rpaRobot.name,
      organisation:
        req.organisation,
      queue: QUEUE_NAME,
      status: "ready",
    });
  }
);

router.get(
  "/work-items",
  async (req, res, next) => {
    try {
      const workItems =
        await listQueueCandidates(
          req.organisation.id
        );

      return res.json({
        success: true,
        queue: QUEUE_NAME,
        robot:
          req.rpaRobot.name,
        count:
          workItems.length,
        workItems,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.get(
  "/work-items/:invoiceId",
  async (req, res, next) => {
    try {
      const transaction =
        await buildQueueTransaction(
          req.organisation.id,
          req.params.invoiceId
        );

      if (!transaction) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              "Invoice transaction not found.",
          });
      }

      return res.json({
        success: true,
        queue: QUEUE_NAME,
        transaction,
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  "/results",
  async (req, res, next) => {
    try {
      const {
        invoiceId,
        status,
        message = "",
        queueItemKey = null,
        exceptionType = null,
      } = req.body || {};

      if (!invoiceId || !status) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              "invoiceId and status are required.",
          });
      }

      const received =
        await recordRobotResult({
          organisationId:
            req.organisation.id,

          robotName:
            req.rpaRobot.name,

          invoiceId,
          status,
          message,
          queueItemKey,
          exceptionType,
        });

      return res.json({
        success: true,
        received,
      });
    } catch (error) {
      if (
        error.code ===
        "INVOICE_NOT_FOUND"
      ) {
        return res
          .status(404)
          .json({
            success: false,
            message:
              error.message,
          });
      }

      if (
        error.code ===
        "INVALID_RPA_STATUS"
      ) {
        return res
          .status(400)
          .json({
            success: false,
            message:
              error.message,
          });
      }

      return next(error);
    }
  }
);

module.exports = router;
