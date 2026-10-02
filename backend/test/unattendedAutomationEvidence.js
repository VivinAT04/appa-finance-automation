require("dotenv").config();

const db = require("../src/database");

const ORGANISATION_ID = "org-appa-finance";
const QUEUE_NAME = "APPA-INVOICE-MATCHING";

function pass(message) {
  console.log(`✓ ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function main() {
  console.log("");
  console.log("APPA UNATTENDED AUTOMATION EVIDENCE AUDIT");
  console.log("==========================================");

  const organisation = await db.one(
    `
      SELECT id, name, status
      FROM organisations
      WHERE id = $1
      LIMIT 1
    `,
    [ORGANISATION_ID]
  );

  if (!organisation) {
    fail("APPA organisation not found.");
  }

  if (organisation.status !== "Active") {
    fail("APPA organisation is not Active.");
  }

  pass("APPA organisation active");

  const queueCandidates = await db.many(
    `
      SELECT
        i.id,
        i.invoice_number AS "invoiceNumber",
        i.validation_status AS "validationStatus",
        COALESCE(
          m.match_status,
          'Not Processed'
        ) AS "matchStatus"
      FROM invoices i
      INNER JOIN documents d
        ON d.id = i.document_id
      LEFT JOIN invoice_matches m
        ON m.invoice_id = i.id
      WHERE d.organisation_id = $1
        AND i.validation_status = 'Validated'
      ORDER BY i.created_at DESC
      LIMIT 20
    `,
    [ORGANISATION_ID]
  );

  if (!queueCandidates.length) {
    fail("No validated APPA invoice exists for automation verification.");
  }

  pass("validated invoice evidence exists");

  const uiPathRuns = await db.many(
    `
      SELECT
        id,
        process_name AS "processName",
        source,
        status,
        items_processed AS "itemsProcessed",
        items_succeeded AS "itemsSucceeded",
        items_failed AS "itemsFailed",
        started_at AS "startedAt",
        completed_at AS "completedAt",
        details
      FROM automation_runs
      WHERE organisation_id = $1
        AND process_name = 'UiPath Invoice Performer'
      ORDER BY started_at DESC
      LIMIT 100
    `,
    [ORGANISATION_ID]
  );

  if (!uiPathRuns.length) {
    fail("No UiPath Invoice Performer automation run exists.");
  }

  pass("UiPath Performer callback evidence exists");

  const successfulRun = uiPathRuns.find(
    (run) =>
      run.status === "Completed" &&
      run.itemsProcessed === 1 &&
      run.itemsSucceeded === 1 &&
      run.itemsFailed === 0
  );

  if (!successfulRun) {
    fail("No successful UiPath Performer callback run found.");
  }

  pass("successful UiPath Performer callback persisted");

  const exceptionRun = uiPathRuns.find(
    (run) =>
      run.status === "Completed with exceptions" &&
      run.itemsProcessed === 1 &&
      run.itemsFailed === 1
  );

  if (!exceptionRun) {
    fail("No UiPath exception callback evidence found.");
  }

  pass("UiPath exception callback persisted");

  const resultAudit = await db.many(
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
        AND action = 'RPA_RESULT_RECEIVED'
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [ORGANISATION_ID]
  );

  if (!resultAudit.length) {
    fail("No RPA_RESULT_RECEIVED audit evidence found.");
  }

  pass("RPA result audit evidence exists");

  const successfulAudit = resultAudit.find(
    (row) =>
      String(row.description || "").includes("Successful")
  );

  if (!successfulAudit) {
    fail("No successful robot result audit found.");
  }

  pass("successful robot result audit exists");

  const transactionAudit = await db.many(
    `
      SELECT
        action,
        entity_type AS "entityType",
        entity_id AS "entityId",
        description,
        created_at AS "createdAt"
      FROM audit_logs
      WHERE organisation_id = $1
        AND action = 'RPA_TRANSACTION_COMPLETED'
        AND entity_type = 'automation_run'
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [ORGANISATION_ID]
  );

  if (!transactionAudit.length) {
    fail("No RPA_TRANSACTION_COMPLETED audit evidence found.");
  }

  if (
    !transactionAudit.some(
      (row) => row.entityId === successfulRun.id
    )
  ) {
    fail(
      "Successful UiPath automation run has no transaction completion audit."
    );
  }

  pass("successful automation run has completion audit");

  const rpaExceptions = await db.many(
    `
      SELECT
        e.id,
        e.exception_type AS "exceptionType",
        e.severity,
        e.status,
        e.resolution,
        e.resolved_at AS "resolvedAt"
      FROM exceptions e
      INNER JOIN invoices i
        ON i.id = e.invoice_id
      INNER JOIN documents d
        ON d.id = i.document_id
      WHERE d.organisation_id = $1
        AND e.exception_type IN (
          'RPA Business Exception',
          'RPA Application Exception'
        )
      ORDER BY e.created_at DESC
      LIMIT 100
    `,
    [ORGANISATION_ID]
  );

  const businessException = rpaExceptions.find(
    (item) =>
      item.exceptionType === "RPA Business Exception"
  );

  const applicationException = rpaExceptions.find(
    (item) =>
      item.exceptionType === "RPA Application Exception"
  );

  if (!businessException) {
    fail("RPA Business Exception evidence missing.");
  }

  if (!applicationException) {
    fail("RPA Application Exception evidence missing.");
  }

  if (businessException.severity !== "Medium") {
    fail("RPA Business Exception severity is not Medium.");
  }

  if (applicationException.severity !== "High") {
    fail("RPA Application Exception severity is not High.");
  }

  pass("BusinessException evidence valid");
  pass("ApplicationException evidence valid");

  const openRpaExceptions = rpaExceptions.filter(
    (item) => item.status === "Open"
  );

  if (openRpaExceptions.length !== 0) {
    fail(
      `${openRpaExceptions.length} RPA exception(s) remain open.`
    );
  }

  pass("no unresolved RPA test exceptions");

  const resolutionAudit = await db.many(
    `
      SELECT
        action,
        entity_type AS "entityType",
        entity_id AS "entityId",
        description
      FROM audit_logs
      WHERE organisation_id = $1
        AND action = 'RPA_EXCEPTION_RESOLVED'
        AND entity_type = 'exception'
      ORDER BY created_at DESC
      LIMIT 100
    `,
    [ORGANISATION_ID]
  );

  if (!resolutionAudit.length) {
    fail("RPA exception resolution audit evidence missing.");
  }

  pass("RPA exception resolution audit exists");

  console.log("");
  console.log(`Queue contract: ${QUEUE_NAME}`);
  console.log(
    `Latest successful callback run: ${successfulRun.id}`
  );

  console.log("");
  console.log("==========================================");
  console.log("APPA UNATTENDED EVIDENCE AUDIT PASSED ✓");
  console.log("==========================================");
  console.log("");
  console.log(
    "This verifies persisted APPA evidence produced by the UiPath integration."
  );
  console.log(
    "UiPath Orchestrator trigger/job configuration remains verified separately in Orchestrator."
  );
}

main().catch((error) => {
  console.error("");
  console.error("APPA UNATTENDED EVIDENCE AUDIT FAILED ✗");
  console.error(error.message);
  process.exitCode = 1;
});
