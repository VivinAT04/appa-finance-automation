import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  FileText,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import "./ReportingOperations.css";

function number(value) {
  return Number(value || 0);
}

function percent(value) {
  return `${number(value).toFixed(1)}%`;
}

function money(value, currency = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(number(value));
  } catch {
    return `${currency} ${number(value).toLocaleString()}`;
  }
}

function label(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function MetricCard({
  icon: Icon,
  label: title,
  value,
  detail,
  tone = "neutral",
}) {
  return (
    <article
      className={`reporting-metric reporting-metric-${tone}`}
    >
      <div className="reporting-metric-icon">
        <Icon size={18} />
      </div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function EmptyReport({ children }) {
  return (
    <div className="reporting-empty">
      <BarChart3 size={22} />
      <p>{children}</p>
    </div>
  );
}

export default function ReportingOperations({
  report,
  loading = false,
  onRefresh,
}) {
  const invoices = Array.isArray(
    report?.invoiceSummary
  )
    ? report.invoiceSummary
    : [];

  const matches = Array.isArray(
    report?.matchSummary
  )
    ? report.matchSummary
    : [];

  const exceptions = Array.isArray(
    report?.exceptionSummary
  )
    ? report.exceptionSummary
    : [];

  const automation = Array.isArray(
    report?.automationSummary
  )
    ? report.automationSummary
    : [];

  const invoiceCount =
    invoices.reduce(
      (sum, row) =>
        sum + number(row.invoiceCount),
      0
    );

  const currencies =
    invoices.length;

  const weightedConfidence =
    invoiceCount
      ? invoices.reduce(
          (sum, row) =>
            sum +
            number(row.averageConfidence) *
              number(row.invoiceCount),
          0
        ) / invoiceCount
      : 0;

  const matchedCount =
    matches
      .filter(
        (row) =>
          String(row.matchStatus)
            .toLowerCase() === "matched"
      )
      .reduce(
        (sum, row) =>
          sum + number(row.count),
        0
      );

  const matchCount =
    matches.reduce(
      (sum, row) =>
        sum + number(row.count),
      0
    );

  const openExceptions =
    exceptions
      .filter(
        (row) =>
          String(row.status)
            .toLowerCase() === "open"
      )
      .reduce(
        (sum, row) =>
          sum + number(row.count),
        0
      );

  const totalRuns =
    automation.reduce(
      (sum, row) =>
        sum + number(row.runCount),
      0
    );

  const processed =
    automation.reduce(
      (sum, row) =>
        sum + number(row.itemsProcessed),
      0
    );

  const succeeded =
    automation.reduce(
      (sum, row) =>
        sum + number(row.itemsSucceeded),
      0
    );

  const failed =
    automation.reduce(
      (sum, row) =>
        sum + number(row.itemsFailed),
      0
    );

  const automationRate =
    processed
      ? (succeeded / processed) * 100
      : 0;

  const matchingRate =
    matchCount
      ? (matchedCount / matchCount) * 100
      : 0;

  return (
    <section className="panel reporting-panel reporting-enter">
      <header className="reporting-header">
        <div>
          <span className="reporting-eyebrow">
            Finance intelligence
          </span>

          <h2>Reports</h2>

          <p>
            Accounts-payable reporting generated directly
            from APPA workflow records, matching outcomes,
            exceptions and automation runs.
          </p>
        </div>

        <button
          type="button"
          className="reporting-refresh"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw
            size={15}
            className={
              loading
                ? "reporting-spin"
                : ""
            }
          />
          Refresh
        </button>
      </header>

      <div className="reporting-metrics">
        <MetricCard
          icon={FileText}
          label="Invoices"
          value={invoiceCount}
          detail={`${currencies} active ${
            currencies === 1
              ? "currency"
              : "currencies"
          }`}
        />

        <MetricCard
          icon={ShieldCheck}
          label="Average confidence"
          value={percent(weightedConfidence)}
          detail="Extraction confidence"
          tone="positive"
        />

        <MetricCard
          icon={CheckCircle2}
          label="Matched"
          value={percent(matchingRate)}
          detail={`${matchedCount} of ${matchCount} match records`}
          tone={
            matchingRate === 100
              ? "positive"
              : "warning"
          }
        />

        <MetricCard
          icon={AlertTriangle}
          label="Open exceptions"
          value={openExceptions}
          detail="Require operational attention"
          tone={
            openExceptions
              ? "danger"
              : "positive"
          }
        />
      </div>

      <div className="reporting-grid">
        <article className="reporting-card reporting-wide">
          <div className="reporting-card-heading">
            <div>
              <span>Financial exposure</span>
              <h3>Invoice portfolio</h3>
            </div>

            <TrendingUp size={18} />
          </div>

          {!invoices.length ? (
            <EmptyReport>
              No invoice reporting data is available.
            </EmptyReport>
          ) : (
            <div className="reporting-table-wrapper">
              <table className="reporting-table">
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th>Invoices</th>
                    <th>Total value</th>
                    <th>Avg confidence</th>
                  </tr>
                </thead>

                <tbody>
                  {invoices.map((row) => (
                    <tr key={row.currency}>
                      <td>
                        <strong>
                          {row.currency}
                        </strong>
                      </td>

                      <td>
                        {number(
                          row.invoiceCount
                        )}
                      </td>

                      <td>
                        {money(
                          row.totalValue,
                          row.currency
                        )}
                      </td>

                      <td>
                        {percent(
                          row.averageConfidence
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>

        <article className="reporting-card">
          <div className="reporting-card-heading">
            <div>
              <span>Control effectiveness</span>
              <h3>PO matching</h3>
            </div>

            <ShieldCheck size={18} />
          </div>

          {!matches.length ? (
            <EmptyReport>
              No PO matching results yet.
            </EmptyReport>
          ) : (
            <div className="reporting-list">
              {matches.map((row) => (
                <div
                  className="reporting-list-row"
                  key={row.matchStatus}
                >
                  <div>
                    <strong>
                      {label(row.matchStatus)}
                    </strong>
                    <small>
                      {number(row.count)} records
                    </small>
                  </div>

                  <span>
                    {percent(row.averageScore)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="reporting-card">
          <div className="reporting-card-heading">
            <div>
              <span>Exception control</span>
              <h3>Exception profile</h3>
            </div>

            <AlertTriangle size={18} />
          </div>

          {!exceptions.length ? (
            <EmptyReport>
              No exceptions recorded.
            </EmptyReport>
          ) : (
            <div className="reporting-list">
              {exceptions.map(
                (row, index) => (
                  <div
                    className="reporting-list-row"
                    key={`${row.exceptionType}-${row.status}-${index}`}
                  >
                    <div>
                      <strong>
                        {label(
                          row.exceptionType
                        )}
                      </strong>

                      <small>
                        {row.status}
                      </small>
                    </div>

                    <span>
                      {number(row.count)}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </article>

        <article className="reporting-card reporting-wide">
          <div className="reporting-card-heading">
            <div>
              <span>Automation performance</span>
              <h3>AP processing runs</h3>
            </div>

            <Bot size={18} />
          </div>

          <div className="reporting-automation-summary">
            <div>
              <span>Runs</span>
              <strong>{totalRuns}</strong>
            </div>

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
              <span>Success rate</span>
              <strong>
                {percent(automationRate)}
              </strong>
            </div>
          </div>

          {!automation.length ? (
            <EmptyReport>
              No automation runs recorded.
            </EmptyReport>
          ) : (
            <div className="reporting-table-wrapper">
              <table className="reporting-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Runs</th>
                    <th>Processed</th>
                    <th>Matched</th>
                    <th>Exceptions</th>
                  </tr>
                </thead>

                <tbody>
                  {automation.map((row) => (
                    <tr key={row.status}>
                      <td>
                        <span className="reporting-status">
                          <Activity size={12} />
                          {row.status}
                        </span>
                      </td>

                      <td>
                        {number(row.runCount)}
                      </td>

                      <td>
                        {number(
                          row.itemsProcessed
                        )}
                      </td>

                      <td>
                        {number(
                          row.itemsSucceeded
                        )}
                      </td>

                      <td>
                        {number(
                          row.itemsFailed
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </div>

      <div className="reporting-note">
        <BarChart3 size={16} />

        <div>
          <strong>
            Operational reporting scope
          </strong>

          <p>
            These metrics represent records currently
            stored in the APPA workflow database. They
            are operational indicators, not statutory
            financial statements.
          </p>
        </div>
      </div>
    </section>
  );
}
