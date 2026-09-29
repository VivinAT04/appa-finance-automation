import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  FileCheck2,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import {
  getInvoices,
  getPurchaseOrders,
  getApprovals,
  getPendingApprovals,
  getExceptions,
  getAutomationRuns,
  getReports,
  getSettings,
  matchInvoiceToPO,
  submitApproval,
  resolveException,
  runAPCycle,
  updateSetting,
} from "../api";

import InvoiceOperations from "./InvoiceOperations";
import ApprovalOperations from "./ApprovalOperations";
import ExceptionWorkbench from "./ExceptionWorkbench";

import "./EnterpriseModule.css";

function money(value, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "INR"} ${Number(value || 0).toFixed(2)}`;
  }
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function StatusBadge({ value }) {
  const normalized = String(value || "").toLowerCase();

  const positive = [
    "validated",
    "matched",
    "approved",
    "completed",
    "resolved",
    "active",
  ].some((item) => normalized === item);

  const danger = [
    "rejected",
    "failed",
    "exception",
    "open",
  ].some((item) => normalized === item);

  return (
    <span
      className={[
        "enterprise-status",
        positive ? "enterprise-status-positive" : "",
        danger ? "enterprise-status-danger" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {value || "Unknown"}
    </span>
  );
}

function EmptyState({ children }) {
  return (
    <div className="enterprise-empty">
      <FileCheck2 size={27} />
      <strong>{children}</strong>
    </div>
  );
}

function PageHeader({
  title,
  description,
  onRefresh,
  action,
}) {
  return (
    <div className="enterprise-heading">
      <div>
        <span className="enterprise-eyebrow">
          APPA Finance Operations
        </span>

        <h2>{title}</h2>
        <p>{description}</p>
      </div>

      <div className="enterprise-heading-actions">
        {action}

        <button
          type="button"
          className="enterprise-secondary-button"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
    </div>
  );
}

export default function EnterpriseModule({ module }) {
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      switch (module) {
        case "Invoices":
          setRows(await getInvoices());
          break;

        case "Purchase Orders":
          setRows(await getPurchaseOrders());
          break;

        case "Approvals": {
          const [
            pendingApprovals,
            approvalHistory,
          ] = await Promise.all([
            getPendingApprovals(),
            getApprovals(),
          ]);

          setRows({
            pending: pendingApprovals,
            history: approvalHistory,
          });
          break;
        }

        case "Exceptions":
          setRows(await getExceptions());
          break;

        case "Automation":
          setRows(await getAutomationRuns());
          break;

        case "Reports":
          setReport(await getReports());
          break;

        case "Settings":
          setRows(await getSettings());
          break;

        default:
          setRows([]);
      }
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load module."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [module]);

  async function match(invoiceId) {
    try {
      setWorking(invoiceId);
      setMessage("");
      setError("");

      const result = await matchInvoiceToPO(invoiceId);

      setMessage(
        `Matching completed: ${result.matchStatus} (${result.matchScore}%).`
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Invoice matching failed."
      );
    } finally {
      setWorking("");
    }
  }

  async function manualDecision(
    invoiceId,
    decision,
    comments = ""
  ) {
    try {
      setWorking(invoiceId);
      setMessage("");
      setError("");

      await submitApproval(
        invoiceId,
        decision,
        comments
      );

      setMessage(
        `Invoice ${decision.toLowerCase()} successfully.`
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Approval action failed."
      );
    } finally {
      setWorking("");
    }
  }

  async function resolve(
    id,
    resolution
  ) {
    if (!resolution?.trim()) return;

    try {
      setWorking(id);
      setMessage("");
      setError("");

      await resolveException(
        id,
        resolution.trim()
      );

      setMessage("Exception resolved.");
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Could not resolve exception."
      );
    } finally {
      setWorking("");
    }
  }

  async function runAutomation() {
    try {
      setWorking("automation");
      setMessage("");
      setError("");

      const run = await runAPCycle();

      setMessage(
        `${run.processName}: ${run.status}. ${run.itemsSucceeded}/${run.itemsProcessed} succeeded.`
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Automation cycle failed."
      );
    } finally {
      setWorking("");
    }
  }

  async function editSetting(setting) {
    const value = window.prompt(
      `Enter a new value for ${setting.key}:`,
      setting.value
    );

    if (value === null || !String(value).trim()) {
      return;
    }

    try {
      setWorking(setting.key);
      setMessage("");
      setError("");

      await updateSetting(
        setting.key,
        String(value).trim()
      );

      setMessage(`${setting.key} updated.`);
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Could not update setting."
      );
    } finally {
      setWorking("");
    }
  }

  if (loading) {
    return (
      <section className="panel enterprise-panel">
        <div className="enterprise-loading">
          <RefreshCw size={19} className="enterprise-spin" />
          Loading {module}...
        </div>
      </section>
    );
  }

  return (
    <div className="enterprise-module">
      {error && (
        <div className="enterprise-alert enterprise-alert-error">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="enterprise-alert enterprise-alert-success">
          <CheckCircle2 size={17} />
          <span>{message}</span>
        </div>
      )}

      {module === "Invoices" && (
        <InvoiceOperations
          rows={rows}
          working={working}
          onRefresh={load}
          onMatch={match}
        />
      )}

      {module === "Purchase Orders" && (
        <PurchaseOrdersView
          rows={rows}
          onRefresh={load}
        />
      )}

      {module === "Approvals" && (
        <ApprovalOperations
          pending={rows?.pending || []}
          history={rows?.history || []}
          working={working}
          onRefresh={load}
          onDecision={manualDecision}
        />
      )}

      {module === "Exceptions" && (
        <ExceptionWorkbench
          rows={rows}
          working={working}
          onRefresh={load}
          onResolve={resolve}
        />
      )}

      {module === "Automation" && (
        <AutomationView
          rows={rows}
          working={working}
          onRefresh={load}
          onRun={runAutomation}
        />
      )}

      {module === "Reports" && (
        <ReportsView
          report={report}
          onRefresh={load}
        />
      )}

      {module === "Settings" && (
        <SettingsView
          rows={rows}
          working={working}
          onRefresh={load}
          onEdit={editSetting}
        />
      )}
    </div>
  );
}

function InvoicesView({
  rows,
  working,
  onRefresh,
  onMatch,
}) {
  return (
    <section className="panel enterprise-panel">
      <PageHeader
        title="Invoices"
        description="Extracted supplier invoices ready for validation, purchase-order matching and approval."
        onRefresh={onRefresh}
      />

      {!rows.length ? (
        <EmptyState>
          No extracted invoices available.
        </EmptyState>
      ) : (
        <div className="enterprise-grid">
          {rows.map((invoice) => (
            <article
              className="enterprise-card"
              key={invoice.id}
            >
              <div className="enterprise-card-top">
                <div className="enterprise-icon-box">
                  <FileCheck2 size={19} />
                </div>

                <StatusBadge
                  value={invoice.validationStatus}
                />
              </div>

              <div className="enterprise-card-title">
                <h3>
                  {invoice.invoiceNumber ||
                    "Invoice"}
                </h3>

                <p>{invoice.supplierName || "Unknown supplier"}</p>
              </div>

              <div className="enterprise-value">
                {money(
                  invoice.totalAmount,
                  invoice.currency
                )}
              </div>

              <div className="enterprise-detail-grid">
                <div>
                  <small>Purchase order</small>
                  <strong>
                    {invoice.purchaseOrderNumber || "Missing"}
                  </strong>
                </div>

                <div>
                  <small>Confidence</small>
                  <strong>
                    {invoice.extractionConfidence ?? 0}%
                  </strong>
                </div>

                <div>
                  <small>Invoice date</small>
                  <strong>
                    {invoice.invoiceDate || "—"}
                  </strong>
                </div>

                <div>
                  <small>Due date</small>
                  <strong>
                    {invoice.dueDate || "—"}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                className="enterprise-primary-button enterprise-full-button"
                disabled={working === invoice.id}
                onClick={() => onMatch(invoice.id)}
              >
                <ShieldCheck size={16} />

                {working === invoice.id
                  ? "Matching..."
                  : "Run PO Match"}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PurchaseOrdersView({
  rows,
  onRefresh,
}) {
  return (
    <section className="panel enterprise-panel">
      <PageHeader
        title="Purchase Orders"
        description="Approved purchasing commitments used by the invoice matching engine."
        onRefresh={onRefresh}
      />

      {!rows.length ? (
        <EmptyState>
          No purchase orders available.
        </EmptyState>
      ) : (
        <div className="enterprise-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>PO number</th>
                <th>Supplier</th>
                <th>Order date</th>
                <th>Subtotal</th>
                <th>Tax</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((po) => (
                <tr key={po.id}>
                  <td>
                    <div className="enterprise-table-primary">
                      <ShoppingCart size={15} />
                      <strong>{po.poNumber}</strong>
                    </div>
                  </td>

                  <td>{po.supplierName}</td>
                  <td>{po.orderDate || "—"}</td>

                  <td>
                    {money(
                      po.subtotal,
                      po.currency
                    )}
                  </td>

                  <td>
                    {money(
                      po.taxAmount,
                      po.currency
                    )}
                  </td>

                  <td>
                    <strong>
                      {money(
                        po.totalAmount,
                        po.currency
                      )}
                    </strong>
                  </td>

                  <td>
                    <StatusBadge value={po.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ApprovalsView({
  rows,
  working,
  onRefresh,
  onDecision,
}) {
  return (
    <section className="panel enterprise-panel">
      <PageHeader
        title="Approvals"
        description="Automatic and manual invoice approval decisions with a complete operational record."
        onRefresh={onRefresh}
      />

      {!rows.length ? (
        <EmptyState>
          No approval decisions recorded yet.
        </EmptyState>
      ) : (
        <div className="enterprise-grid">
          {rows.map((approval) => (
            <article
              className="enterprise-card"
              key={approval.id}
            >
              <div className="enterprise-card-top">
                <div className="enterprise-icon-box">
                  <CheckCircle2 size={19} />
                </div>

                <StatusBadge
                  value={approval.decision}
                />
              </div>

              <div className="enterprise-card-title">
                <h3>{approval.invoiceNumber}</h3>
                <p>{approval.supplierName}</p>
              </div>

              <div className="enterprise-value">
                {money(
                  approval.totalAmount,
                  approval.currency
                )}
              </div>

              <div className="enterprise-meta-line">
                <span>{approval.approvalType}</span>
                <span>•</span>
                <span>
                  {approval.approver || "System"}
                </span>
              </div>

              {approval.comments && (
                <p className="enterprise-description">
                  {approval.comments}
                </p>
              )}

              <div className="enterprise-card-actions">
                <button
                  type="button"
                  className="enterprise-approve-button"
                  disabled={working === approval.invoiceId}
                  onClick={() =>
                    onDecision(
                      approval.invoiceId,
                      "Approved"
                    )
                  }
                >
                  <CheckCircle2 size={15} />
                  Approve
                </button>

                <button
                  type="button"
                  className="enterprise-reject-button"
                  disabled={working === approval.invoiceId}
                  onClick={() =>
                    onDecision(
                      approval.invoiceId,
                      "Rejected"
                    )
                  }
                >
                  <XCircle size={15} />
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ExceptionsView({
  rows,
  working,
  onRefresh,
  onResolve,
}) {
  const openCount = rows.filter(
    (item) => item.status === "Open"
  ).length;

  return (
    <section className="panel enterprise-panel">
      <PageHeader
        title="Exceptions"
        description={`${openCount} open exception${openCount === 1 ? "" : "s"} requiring operational review.`}
        onRefresh={onRefresh}
      />

      {!rows.length ? (
        <EmptyState>
          No workflow exceptions recorded.
        </EmptyState>
      ) : (
        <div className="enterprise-grid">
          {rows.map((item) => (
            <article
              className="enterprise-card"
              key={item.id}
            >
              <div className="enterprise-card-top">
                <div className="enterprise-icon-box enterprise-warning-icon">
                  <AlertTriangle size={19} />
                </div>

                <StatusBadge value={item.status} />
              </div>

              <div className="enterprise-card-title">
                <h3>
                  {String(item.exceptionType)
                    .replaceAll("_", " ")}
                </h3>

                <p>
                  {item.invoiceNumber} ·{" "}
                  {item.supplierName}
                </p>
              </div>

              <div className="enterprise-meta-line">
                <span>Severity</span>
                <strong>{item.severity}</strong>
              </div>

              <p className="enterprise-description">
                {item.description}
              </p>

              {item.resolution && (
                <div className="enterprise-resolution">
                  <small>Resolution</small>
                  <p>{item.resolution}</p>
                </div>
              )}

              {item.status === "Open" && (
                <button
                  type="button"
                  className="enterprise-primary-button enterprise-full-button"
                  disabled={working === item.id}
                  onClick={() => onResolve(item.id)}
                >
                  <CheckCircle2 size={15} />
                  Resolve Exception
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AutomationView({
  rows,
  working,
  onRefresh,
  onRun,
}) {
  const action = (
    <button
      type="button"
      className="enterprise-primary-button"
      disabled={working === "automation"}
      onClick={onRun}
    >
      <Play size={15} />

      {working === "automation"
        ? "Running..."
        : "Run AP Cycle"}
    </button>
  );

  return (
    <section className="panel enterprise-panel">
      <PageHeader
        title="Automation"
        description="Execution history for APPA invoice matching and finance workflow automation."
        onRefresh={onRefresh}
        action={action}
      />

      <div className="enterprise-info-banner">
        <Bot size={19} />

        <div>
          <strong>
            APPA Automation Engine
          </strong>

          <p>
            Processes validated invoices through
            matching, exception detection and
            automatic approval. UiPath integration
            uses the dedicated RPA API contract.
          </p>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState>
          No automation runs recorded yet.
        </EmptyState>
      ) : (
        <div className="enterprise-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Process</th>
                <th>Source</th>
                <th>Status</th>
                <th>Processed</th>
                <th>Succeeded</th>
                <th>Failed</th>
                <th>Started</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((run) => (
                <tr key={run.id}>
                  <td>
                    <div className="enterprise-table-primary">
                      <Bot size={15} />
                      <strong>{run.processName}</strong>
                    </div>
                  </td>

                  <td>{run.source}</td>

                  <td>
                    <StatusBadge value={run.status} />
                  </td>

                  <td>{run.itemsProcessed}</td>
                  <td>{run.itemsSucceeded}</td>
                  <td>{run.itemsFailed}</td>
                  <td>{formatDate(run.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportsView({
  report,
  onRefresh,
}) {
  const invoices =
    report?.invoiceSummary || [];

  const matches =
    report?.matchSummary || [];

  const exceptions =
    report?.exceptionSummary || [];

  const automation =
    report?.automationSummary || [];

  return (
    <section className="panel enterprise-panel">
      <PageHeader
        title="Reports"
        description="Operational accounts-payable metrics generated directly from the workflow database."
        onRefresh={onRefresh}
      />

      <div className="enterprise-report-grid">
        <article className="enterprise-report-card">
          <div className="enterprise-report-icon">
            <BarChart3 size={19} />
          </div>

          <h3>Invoice Value</h3>

          {!invoices.length ? (
            <p>No invoice data.</p>
          ) : (
            invoices.map((item) => (
              <div
                className="enterprise-report-row"
                key={item.currency}
              >
                <div>
                  <strong>
                    {item.invoiceCount}
                  </strong>
                  <small>Invoices</small>
                </div>

                <strong>
                  {money(
                    item.totalValue,
                    item.currency
                  )}
                </strong>
              </div>
            ))
          )}
        </article>

        <article className="enterprise-report-card">
          <div className="enterprise-report-icon">
            <ShieldCheck size={19} />
          </div>

          <h3>PO Matching</h3>

          {!matches.length ? (
            <p>No matching data yet.</p>
          ) : (
            matches.map((item) => (
              <div
                className="enterprise-report-row"
                key={item.matchStatus}
              >
                <div>
                  <strong>{item.count}</strong>
                  <small>{item.matchStatus}</small>
                </div>

                <strong>
                  {Number(
                    item.averageScore || 0
                  ).toFixed(1)}
                  %
                </strong>
              </div>
            ))
          )}
        </article>

        <article className="enterprise-report-card">
          <div className="enterprise-report-icon">
            <AlertTriangle size={19} />
          </div>

          <h3>Exceptions</h3>

          {!exceptions.length ? (
            <p>No exceptions recorded.</p>
          ) : (
            exceptions.map((item, index) => (
              <div
                className="enterprise-report-row"
                key={`${item.exceptionType}-${item.status}-${index}`}
              >
                <div>
                  <strong>{item.count}</strong>
                  <small>
                    {String(item.exceptionType)
                      .replaceAll("_", " ")}
                  </small>
                </div>

                <StatusBadge value={item.status} />
              </div>
            ))
          )}
        </article>

        <article className="enterprise-report-card">
          <div className="enterprise-report-icon">
            <Bot size={19} />
          </div>

          <h3>Automation</h3>

          {!automation.length ? (
            <p>No automation data yet.</p>
          ) : (
            automation.map((item) => (
              <div
                className="enterprise-report-row"
                key={item.status}
              >
                <div>
                  <strong>{item.runCount}</strong>
                  <small>{item.status}</small>
                </div>

                <strong>
                  {item.itemsSucceeded}/
                  {item.itemsProcessed}
                </strong>
              </div>
            ))
          )}
        </article>
      </div>
    </section>
  );
}

function SettingsView({
  rows,
  working,
  onRefresh,
  onEdit,
}) {
  return (
    <section className="panel enterprise-panel">
      <PageHeader
        title="Settings"
        description="Operational controls used by matching, duplicate detection and automatic approval."
        onRefresh={onRefresh}
      />

      {!rows.length ? (
        <EmptyState>
          No workflow settings available.
        </EmptyState>
      ) : (
        <div className="enterprise-grid">
          {rows.map((setting) => (
            <article
              className="enterprise-card"
              key={setting.key}
            >
              <div className="enterprise-card-top">
                <div className="enterprise-icon-box">
                  <Settings2 size={19} />
                </div>
              </div>

              <div className="enterprise-card-title">
                <h3>
                  {setting.key
                    .replaceAll("_", " ")
                    .toUpperCase()}
                </h3>
              </div>

              <div className="enterprise-setting-value">
                {setting.value}
              </div>

              <p className="enterprise-description">
                {setting.description}
              </p>

              <button
                type="button"
                className="enterprise-secondary-button enterprise-full-button"
                disabled={working === setting.key}
                onClick={() => onEdit(setting)}
              >
                <Settings2 size={15} />
                Change Setting
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
