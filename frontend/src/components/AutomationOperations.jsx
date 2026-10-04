import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Code2,
  Database,
  FileCheck2,
  Gauge,
  History,
  Loader2,
  Play,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import {
  getAutomationRuns,
  getRPAWorkItems,
  runAPCycle,
} from "../api";

import "./AutomationOperations.css";

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(date);
}

function money(value, currency = "GBP") {
  const amount = Number(value || 0);

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency: currency || "GBP",
        maximumFractionDigits: 2,
      }
    ).format(amount);
  } catch {
    return `${currency || "GBP"} ${amount.toFixed(2)}`;
  }
}

function statusClass(value) {
  const normalized = String(value || "")
    .toLowerCase();

  if (
    normalized.includes("completed") &&
    !normalized.includes("exception")
  ) {
    return "automation-status-positive";
  }

  if (
    normalized.includes("matched") &&
    !normalized.includes("not")
  ) {
    return "automation-status-positive";
  }

  if (
    normalized.includes("running") ||
    normalized.includes("process")
  ) {
    return "automation-status-running";
  }

  if (
    normalized.includes("exception") ||
    normalized.includes("failed")
  ) {
    return "automation-status-danger";
  }

  if (
    normalized.includes("validated") ||
    normalized.includes("ready")
  ) {
    return "automation-status-ready";
  }

  return "automation-status-neutral";
}

function StatusPill({ value }) {
  return (
    <span
      className={`automation-status ${statusClass(
        value
      )}`}
    >
      {value || "Unknown"}
    </span>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}) {
  return (
    <article className="automation-metric">
      <div className="automation-metric-icon">
        <Icon size={17} />
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>

        {detail ? (
          <small>{detail}</small>
        ) : null}
      </div>
    </article>
  );
}

function EmptyState({
  icon: Icon = Database,
  title,
  description,
}) {
  return (
    <div className="automation-empty">
      <div className="automation-empty-icon">
        <Icon size={20} />
      </div>

      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function IntegrationStep({
  number,
  title,
  description,
  state,
}) {
  return (
    <article className="automation-contract-step">
      <div className="automation-step-number">
        {number}
      </div>

      <div>
        <div className="automation-step-heading">
          <strong>{title}</strong>
          <StatusPill value={state} />
        </div>

        <p>{description}</p>
      </div>
    </article>
  );
}

function QueueTable({ items }) {
  if (!items.length) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="No work items waiting"
        description="There are currently no validated invoices waiting in the RPA integration queue."
      />
    );
  }

  return (
    <div className="automation-table-wrapper">
      <table className="automation-table">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Supplier</th>
            <th>Purchase Order</th>
            <th>Value</th>
            <th>Confidence</th>
            <th>Validation</th>
            <th>Match State</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => (
            <tr key={item.invoiceId}>
              <td>
                <div className="automation-primary-cell">
                  <FileCheck2 size={14} />

                  <div>
                    <strong>
                      {item.invoiceNumber ||
                        "Unnumbered invoice"}
                    </strong>

                    <small>
                      {String(item.invoiceId).slice(
                        0,
                        8
                      )}
                    </small>
                  </div>
                </div>
              </td>

              <td>
                {item.supplierName || "—"}
              </td>

              <td>
                {item.purchaseOrderNumber ||
                  "Missing PO"}
              </td>

              <td>
                <strong>
                  {money(
                    item.totalAmount,
                    item.currency
                  )}
                </strong>
              </td>

              <td>
                {Number(
                  item.extractionConfidence || 0
                ).toFixed(0)}
                %
              </td>

              <td>
                <StatusPill
                  value={item.validationStatus}
                />
              </td>

              <td>
                <StatusPill
                  value={item.matchStatus}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RunHistory({ runs }) {
  const [expandedId, setExpandedId] =
    useState(null);

  if (!runs.length) {
    return (
      <EmptyState
        icon={History}
        title="No automation runs yet"
        description="Run the AP matching cycle to create the first automation execution record."
      />
    );
  }

  return (
    <div className="automation-run-list">
      {runs.map((run) => {
        const expanded =
          expandedId === run.id;

        const processed =
          Number(run.itemsProcessed || 0);

        const succeeded =
          Number(run.itemsSucceeded || 0);

        const failed =
          Number(run.itemsFailed || 0);

        const rate =
          processed > 0
            ? Math.round(
                (succeeded / processed) * 100
              )
            : 0;

        return (
          <article
            className="automation-run-card"
            key={run.id}
          >
            <button
              type="button"
              className="automation-run-summary"
              onClick={() =>
                setExpandedId(
                  expanded ? null : run.id
                )
              }
            >
              <div className="automation-run-identity">
                <div className="automation-run-icon">
                  <Bot size={16} />
                </div>

                <div>
                  <strong>
                    {run.processName}
                  </strong>

                  <span>
                    {run.source} ·{" "}
                    {formatDate(run.startedAt)}
                  </span>
                </div>
              </div>

              <div className="automation-run-stats">
                <StatusPill
                  value={run.status}
                />

                <span>
                  {processed} processed
                </span>

                <span>
                  {rate}% successful
                </span>

                {expanded ? (
                  <ChevronUp size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
              </div>
            </button>

            {expanded && (
              <div className="automation-run-detail">
                <div>
                  <span>Processed</span>
                  <strong>{processed}</strong>
                </div>

                <div>
                  <span>Matched</span>
                  <strong>{succeeded}</strong>
                </div>

                <div>
                  <span>Exceptions</span>
                  <strong>{failed}</strong>
                </div>

                <div>
                  <span>Completed</span>
                  <strong>
                    {formatDate(
                      run.completedAt
                    )}
                  </strong>
                </div>

                <div className="automation-run-description">
                  <span>Execution detail</span>
                  <p>
                    {run.details ||
                      "No additional execution detail recorded."}
                  </p>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export default function AutomationOperations() {
  const [runs, setRuns] = useState([]);
  const [queueName, setQueueName] =
    useState("APPA-INVOICE-MATCHING");
  const [workItems, setWorkItems] =
    useState([]);

  const [loading, setLoading] =
    useState(true);
  const [running, setRunning] =
    useState(false);
  const [error, setError] =
    useState("");
  const [message, setMessage] =
    useState("");

  const load = useCallback(async () => {
    setError("");

    try {
      const [
        runRows,
        queueResponse,
      ] = await Promise.all([
        getAutomationRuns(),
        getRPAWorkItems(),
      ]);

      setRuns(
        Array.isArray(runRows)
          ? runRows
          : []
      );

      setQueueName(
        queueResponse?.queue ||
          "APPA-INVOICE-MATCHING"
      );

      setWorkItems(
        Array.isArray(
          queueResponse?.workItems
        )
          ? queueResponse.workItems
          : []
      );
    } catch (loadError) {
      console.error(loadError);

      setError(
        loadError?.response?.data
          ?.message ||
          loadError.message ||
          "Could not load automation operations."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const totalRuns = runs.length;

    const processed = runs.reduce(
      (sum, run) =>
        sum +
        Number(run.itemsProcessed || 0),
      0
    );

    const succeeded = runs.reduce(
      (sum, run) =>
        sum +
        Number(run.itemsSucceeded || 0),
      0
    );

    const failed = runs.reduce(
      (sum, run) =>
        sum +
        Number(run.itemsFailed || 0),
      0
    );

    const successRate =
      processed > 0
        ? (
            (succeeded / processed) *
            100
          ).toFixed(1)
        : "0.0";

    return {
      totalRuns,
      processed,
      succeeded,
      failed,
      successRate,
    };
  }, [runs]);

  async function executeCycle() {
    if (running) {
      return;
    }

    setRunning(true);
    setError("");
    setMessage("");

    try {
      const run =
        await runAPCycle(
          "APPA Engine"
        );

      setMessage(
        `AP cycle completed: ${
          run?.itemsSucceeded || 0
        } matched, ${
          run?.itemsFailed || 0
        } exception(s).`
      );

      await load();
    } catch (runError) {
      console.error(runError);

      setError(
        runError?.response?.data
          ?.message ||
          runError.message ||
          "AP automation cycle failed."
      );
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <section className="panel automation-panel automation-enter">
        <div className="automation-loading">
          <Loader2
            className="automation-spin"
            size={21}
          />

          Loading automation operations...
        </div>
      </section>
    );
  }

  return (
    <section className="panel automation-panel automation-enter">
      <header className="automation-header">
        <div>
          <span className="automation-eyebrow">
            FINANCE AUTOMATION
          </span>

          <h2>
            Automation & RPA Operations
          </h2>

          <p>
            Operate APPA's internal matching
            engine and inspect the contract
            prepared for external RPA
            orchestration.
          </p>
        </div>

        <div className="automation-header-actions">
          <button
            type="button"
            className="automation-secondary-button"
            onClick={load}
            disabled={running}
          >
            <RefreshCw size={14} />
            Refresh
          </button>

          <button
            type="button"
            className="automation-primary-button"
            onClick={executeCycle}
            disabled={running}
          >
            {running ? (
              <Loader2
                className="automation-spin"
                size={14}
              />
            ) : (
              <Play size={14} />
            )}

            {running
              ? "Running AP Cycle..."
              : "Run AP Cycle"}
          </button>
        </div>
      </header>

      <div className="automation-truth-banner">
        <ShieldCheck size={18} />

        <div>
          <strong>
            UiPath-ready integration contract
          </strong>

          <p>
            APPA currently exposes the RPA
            queue and result callback API.
            External UiPath execution is not
            active in this application yet.
            The built-in APPA Engine can run
            the matching workflow locally.
          </p>
        </div>

        <span>
          Integration Ready
        </span>
      </div>

      {error && (
        <div className="automation-message automation-message-error">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      {message && (
        <div className="automation-message automation-message-success">
          <CheckCircle2 size={15} />
          {message}
        </div>
      )}

      <div className="automation-metrics">
        <Metric
          icon={Workflow}
          label="RPA Queue"
          value={workItems.length}
          detail="Work items ready"
        />

        <Metric
          icon={History}
          label="Automation Runs"
          value={metrics.totalRuns}
          detail="Recorded executions"
        />

        <Metric
          icon={FileCheck2}
          label="Processed"
          value={metrics.processed}
          detail="Across all runs"
        />

        <Metric
          icon={Gauge}
          label="Match Rate"
          value={`${metrics.successRate}%`}
          detail={`${metrics.succeeded} matched`}
        />
      </div>

      <div className="automation-layout">
        <div className="automation-main-column">
          <article className="automation-card">
            <div className="automation-card-heading">
              <div>
                <span className="automation-card-eyebrow">
                  WORK QUEUE
                </span>

                <h3>
                  RPA Work Items
                </h3>

                <p>
                  Validated invoices that have
                  not reached a successful PO
                  match.
                </p>
              </div>

              <div className="automation-queue-badge">
                <Database size={13} />

                <span>
                  {queueName}
                </span>

                <strong>
                  {workItems.length}
                </strong>
              </div>
            </div>

            <QueueTable
              items={workItems}
            />
          </article>

          <article className="automation-card">
            <div className="automation-card-heading">
              <div>
                <span className="automation-card-eyebrow">
                  EXECUTION HISTORY
                </span>

                <h3>
                  AP Automation Runs
                </h3>

                <p>
                  Database-backed history from
                  the APPA matching engine.
                </p>
              </div>

              <Clock3 size={18} />
            </div>

            <RunHistory runs={runs} />
          </article>
        </div>

        <aside className="automation-side-column">
          <article className="automation-card automation-contract-card">
            <div className="automation-card-heading">
              <div>
                <span className="automation-card-eyebrow">
                  RPA CONTRACT
                </span>

                <h3>
                  UiPath Integration
                </h3>
              </div>

              <Bot size={19} />
            </div>

            <div className="automation-contract-status">
              <div>
                <span>Current state</span>
                <strong>
                  API Contract Ready
                </strong>
              </div>

              <StatusPill
                value="Ready"
              />
            </div>

            <IntegrationStep
              number="01"
              title="Retrieve work"
              state="Available"
              description="Robot retrieves validated invoices from the APPA invoice-matching queue."
            />

            <IntegrationStep
              number="02"
              title="Process item"
              state="External"
              description="UiPath workflow can perform orchestration, document or business processing outside this web application."
            />

            <IntegrationStep
              number="03"
              title="Return result"
              state="Available"
              description="Robot submits invoice ID, robot name, status and an optional execution message."
            />

            <IntegrationStep
              number="04"
              title="Audit result"
              state="Active"
              description="APPA records the received RPA result in the finance audit trail."
            />

            <div className="automation-contract-note">
              <AlertTriangle size={15} />

              <p>
                This screen does not represent
                an active UiPath Orchestrator
                connection. It documents and
                monitors APPA's implemented
                integration boundary.
              </p>
            </div>
          </article>

          <article className="automation-card">
            <div className="automation-card-heading">
              <div>
                <span className="automation-card-eyebrow">
                  ARCHITECTURE
                </span>

                <h3>
                  Processing Flow
                </h3>
              </div>

              <ServerCog size={18} />
            </div>

            <div className="automation-flow">
              <div>
                <Database size={15} />
                <span>Validated Invoice</span>
              </div>

              <i />

              <div>
                <Workflow size={15} />
                <span>RPA Work Queue</span>
              </div>

              <i />

              <div>
                <Bot size={15} />
                <span>External Robot</span>
              </div>

              <i />

              <div>
                <Code2 size={15} />
                <span>Result Callback</span>
              </div>

              <i />

              <div>
                <ShieldCheck size={15} />
                <span>Audit Log</span>
              </div>
            </div>
          </article>

          <article className="automation-card automation-control-card">
            <div className="automation-card-heading">
              <div>
                <span className="automation-card-eyebrow">
                  CONTROL SUMMARY
                </span>

                <h3>
                  Current Operations
                </h3>
              </div>

              <Activity size={18} />
            </div>

            <div className="automation-control-row">
              <span>Queue items</span>
              <strong>
                {workItems.length}
              </strong>
            </div>

            <div className="automation-control-row">
              <span>Matched items</span>
              <strong>
                {metrics.succeeded}
              </strong>
            </div>

            <div className="automation-control-row">
              <span>
                Business exceptions
              </span>
              <strong>
                {metrics.failed}
              </strong>
            </div>

            <div className="automation-control-row">
              <span>UiPath runtime</span>
              <strong className="automation-muted-value">
                Not connected
              </strong>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}
