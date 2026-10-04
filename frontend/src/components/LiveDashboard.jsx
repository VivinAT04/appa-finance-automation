import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  ReceiptText,
  TriangleAlert,
  Workflow,
} from "lucide-react";

function formatCurrency(
  amount,
  currency = "GBP"
) {
  const value = Number(amount || 0);

  try {
    return new Intl.NumberFormat(
      "en-GB",
      {
        style: "currency",
        currency: currency || "GBP",
        maximumFractionDigits: 0,
      }
    ).format(value);
  } catch {
    return `₹${value.toLocaleString(
      "en-GB"
    )}`;
  }
}

function relativeTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const seconds = Math.max(
    0,
    Math.floor(
      (Date.now() - date.getTime()) /
        1000
    )
  );

  if (seconds < 60) {
    return "Just now";
  }

  const minutes =
    Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours =
    Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hr${
      hours === 1 ? "" : "s"
    } ago`;
  }

  const days =
    Math.floor(hours / 24);

  return `${days} day${
    days === 1 ? "" : "s"
  } ago`;
}

function dayLabel(value) {
  const date = new Date(
    `${value}T12:00:00`
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString(
    "en-GB",
    {
      weekday: "short",
    }
  );
}

function Status({ value }) {
  const safeValue =
    value || "Pending";

  const className = safeValue
    .toLowerCase()
    .replaceAll(" ", "-");

  return (
    <span
      className={`status status-${className}`}
    >
      <span className="status-dot" />
      {safeValue}
    </span>
  );
}

export default function LiveDashboard({
  dashboard,
  loading,
  error,
  onNavigate,
}) {
  if (loading) {
    return (
      <section className="live-dashboard-state">
        <Workflow size={22} />
        <strong>
          Loading live finance data...
        </strong>
      </section>
    );
  }

  if (error) {
    return (
      <section className="live-dashboard-state error">
        <TriangleAlert size={22} />
        <strong>
          Unable to load dashboard
        </strong>
        <span>{error}</span>
      </section>
    );
  }

  const data = dashboard || {};

  const transactions =
    data.recentTransactions || [];

  const automationRuns =
    data.recentAutomationRuns || [];

  const dailyVolume =
    data.dailyVolume || [];

  const attention =
    data.attention || {};

  const automation =
    data.automation || {};

  const successRate =
    Number(
      automation.successRate || 0
    );

  const maxVolume = Math.max(
    1,
    ...dailyVolume.map(
      (item) =>
        Number(item.count || 0)
    )
  );

  const openExceptions =
    Number(
      data.openExceptions || 0
    );

  const pendingApprovals =
    Number(
      data.pendingApprovals || 0
    );

  const pendingValue =
    Number(
      data.pendingApprovalValue || 0
    );

  return (
    <>
      <div className="metric-grid">
        <article className="metric-card">
          <div className="metric-top">
            <span>
              Invoices processed
            </span>

            <div className="metric-icon">
              <ReceiptText size={19} />
            </div>
          </div>

          <div className="metric-value">
            {Number(
              data.invoices || 0
            ).toLocaleString("en-GB")}
          </div>

          <div className="metric-bottom positive">
            <CircleCheck size={15} />

            {Number(
              data.matchedInvoices || 0
            ).toLocaleString("en-GB")}

            <span>
              successfully matched
            </span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-top">
            <span>
              Pending approvals
            </span>

            <div className="metric-icon">
              <Clock3 size={19} />
            </div>
          </div>

          <div className="metric-value">
            {pendingApprovals.toLocaleString(
              "en-GB"
            )}
          </div>

          <div className="metric-bottom neutral">
            <span>
              {formatCurrency(
                pendingValue,
                "GBP"
              )}{" "}
              awaiting review
            </span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-top">
            <span>
              Automation success
            </span>

            <div className="metric-icon">
              <CircleCheck size={19} />
            </div>
          </div>

          <div className="metric-value">
            {successRate.toFixed(1)}%
          </div>

          <div className="metric-bottom positive">
            <Workflow size={15} />

            {Number(
              automation.succeeded || 0
            ).toLocaleString("en-GB")}

            <span>
              successful items
            </span>
          </div>
        </article>

        <article className="metric-card">
          <div className="metric-top">
            <span>Exceptions</span>

            <div className="metric-icon warning-icon">
              <CircleAlert size={19} />
            </div>
          </div>

          <div className="metric-value">
            {openExceptions.toLocaleString(
              "en-GB"
            )}
          </div>

          <div className="metric-bottom warning-text">
            <span>
              {Number(
                attention.highSeverityExceptions ||
                  0
              ).toLocaleString("en-GB")}{" "}
              high severity
            </span>
          </div>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="panel transactions-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Recent transactions
              </h2>

              <p>
                Latest invoice processing
                activity
              </p>
            </div>

            <button
              className="text-button"
              type="button"
              onClick={() =>
                onNavigate?.("Invoices")
              }
            >
              View all
              <ArrowUpRight size={15} />
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Supplier</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>

              <tbody>
                {transactions.length ? (
                  transactions.map(
                    (transaction) => (
                      <tr
                        key={
                          transaction.id ||
                          transaction.invoice
                        }
                      >
                        <td className="invoice-number">
                          {transaction.invoice ||
                            "—"}
                        </td>

                        <td>
                          {transaction.supplier ||
                            "Unknown supplier"}
                        </td>

                        <td className="amount">
                          {formatCurrency(
                            transaction.amount,
                            transaction.currency
                          )}
                        </td>

                        <td>
                          <Status
                            value={
                              transaction.status
                            }
                          />
                        </td>

                        <td className="muted">
                          {relativeTime(
                            transaction.updatedAt
                          )}
                        </td>
                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td
                      colSpan="5"
                      className="live-empty-row"
                    >
                      No processed invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel automation-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Automation health
              </h2>

              <p>
                Live workflow status
              </p>
            </div>

            <div className="live-indicator">
              <span />
              LIVE
            </div>
          </div>

          <div className="automation-score">
            <div
              className="score-ring"
              style={{
                "--score":
                  `${Math.max(
                    0,
                    Math.min(
                      100,
                      successRate
                    )
                  )}%`,
              }}
            >
              <div>
                <strong>
                  {successRate.toFixed(1)}
                </strong>
                <span>%</span>
              </div>
            </div>

            <div>
              <strong>
                {Number(
                  automation.failed || 0
                ) === 0
                  ? "Systems operational"
                  : "Review automation failures"}
              </strong>

              <p>
                {Number(
                  automation.processed || 0
                ).toLocaleString("en-GB")}{" "}
                items processed across{" "}
                {Number(
                  data.automationRuns || 0
                ).toLocaleString("en-GB")}{" "}
                automation runs.
              </p>
            </div>
          </div>

          <div className="automation-list">
            {automationRuns.length ? (
              automationRuns.map(
                (run) => {
                  let displayStatus =
                    run.status || "Pending";

                  if (
                    String(
                      displayStatus
                    ).toLowerCase() ===
                    "completed"
                  ) {
                    displayStatus =
                      Number(
                        run.itemsFailed || 0
                      ) > 0
                        ? "Exception"
                        : "Healthy";
                  }

                  return (
                    <div
                      className="automation-row"
                      key={run.id}
                    >
                      <div className="automation-row-icon">
                        <Workflow size={17} />
                      </div>

                      <div className="automation-row-copy">
                        <strong>
                          {run.title}
                        </strong>

                        <span>
                          {run.subtitle ||
                            "APPA Engine"}
                        </span>
                      </div>

                      <Status
                        value={
                          displayStatus
                        }
                      />
                    </div>
                  );
                }
              )
            ) : (
              <div className="live-automation-empty">
                <Workflow size={18} />
                <span>
                  No automation runs yet.
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel overview-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Processing overview
              </h2>

              <p>
                Invoice volume · Last 7 days
              </p>
            </div>

            <span className="period-button">
              Last 7 days
            </span>
          </div>

          <div className="chart">
            {dailyVolume.map(
              (item) => {
                const count =
                  Number(
                    item.count || 0
                  );

                const height =
                  count === 0
                    ? 4
                    : Math.max(
                        12,
                        Math.round(
                          count /
                            maxVolume *
                            100
                        )
                      );

                return (
                  <div
                    className="chart-column"
                    key={item.date}
                    title={`${count} invoice${
                      count === 1
                        ? ""
                        : "s"
                    }`}
                  >
                    <div className="bar-track">
                      <div
                        className="bar"
                        style={{
                          height:
                            `${height}%`,
                        }}
                      />
                    </div>

                    <span>
                      {dayLabel(
                        item.date
                      )}
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </section>

        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <h2>
                Needs attention
              </h2>

              <p>
                Items requiring human review
              </p>
            </div>
          </div>

          <button
            type="button"
            className="attention-item live-attention-button"
            onClick={() =>
              onNavigate?.("Exceptions")
            }
          >
            <div className="attention-icon">
              <TriangleAlert size={18} />
            </div>

            <div>
              <strong>
                {Number(
                  attention.mismatches || 0
                )}{" "}
                invoice mismatches
              </strong>

              <span>
                PO or invoice validation
                requires review
              </span>
            </div>

            <ArrowUpRight size={17} />
          </button>

          <button
            type="button"
            className="attention-item live-attention-button"
            onClick={() =>
              onNavigate?.("Documents")
            }
          >
            <div className="attention-icon">
              <FileText size={18} />
            </div>

            <div>
              <strong>
                {Number(
                  attention.lowConfidence ||
                    0
                )}{" "}
                low-confidence documents
              </strong>

              <span>
                Extraction confidence below
                80%
              </span>
            </div>

            <ArrowUpRight size={17} />
          </button>

          <button
            type="button"
            className="attention-item live-attention-button"
            onClick={() =>
              onNavigate?.("Approvals")
            }
          >
            <div className="attention-icon">
              <Clock3 size={18} />
            </div>

            <div>
              <strong>
                {Number(
                  attention.overdueApprovals ||
                    0
                )}{" "}
                approvals overdue
              </strong>

              <span>
                Waiting more than 24 hours
              </span>
            </div>

            <ArrowUpRight size={17} />
          </button>
        </section>
      </div>
    </>
  );
}
