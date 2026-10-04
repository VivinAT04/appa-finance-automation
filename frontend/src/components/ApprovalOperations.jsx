import {
  useMemo,
  useState,
} from "react";

import {
  CheckCircle2,
  Clock3,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import "./FinanceOperations.css";

function money(value, currency = "GBP") {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: currency || "GBP",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "GBP"} ${Number(
      value || 0
    ).toFixed(2)}`;
  }
}

function Status({ value }) {
  const normalized =
    String(value || "").toLowerCase();

  const positive = [
    "approved",
    "matched",
    "completed",
  ].includes(normalized);

  const danger = [
    "rejected",
    "exception",
    "failed",
  ].includes(normalized);

  return (
    <span
      className={[
        "finance-status",
        positive
          ? "finance-status-positive"
          : "",
        danger
          ? "finance-status-danger"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {value || "Pending"}
    </span>
  );
}

export default function ApprovalOperations({
  pending: rawPending,
  history: rawHistory,
  working,
  onRefresh,
  onDecision,
}) {
  const pending = Array.isArray(rawPending)
    ? rawPending
    : [];

  const history = Array.isArray(rawHistory)
    ? rawHistory
    : [];
  const [query, setQuery] =
    useState("");

  const [tab, setTab] =
    useState("pending");

  const [decision, setDecision] =
    useState(null);

  const [comments, setComments] =
    useState("");

  const source =
    tab === "pending"
      ? pending
      : history;

  const filtered = useMemo(() => {
    const q =
      query.trim().toLowerCase();

    if (!q) return source;

    return source.filter((item) =>
      [
        item.invoiceNumber,
        item.supplierName,
        item.purchaseOrderNumber,
        item.decision,
        item.approver,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(q)
        )
    );
  }, [source, query]);

  async function confirmDecision() {
    if (!decision) return;

    await onDecision(
      decision.invoiceId,
      decision.value,
      comments.trim()
    );

    setDecision(null);
    setComments("");
  }

  const pendingValue =
    pending.reduce(
      (sum, item) =>
        sum +
        Number(item.totalAmount || 0),
      0
    );

  return (
    <section className="panel finance-panel finance-enter">
      <div className="finance-header">
        <div>
          <span className="finance-eyebrow">
            APPA Finance Operations
          </span>

          <h2>Approval Queue</h2>

          <p>
            Review invoices that have passed
            configured matching controls and
            are ready for a finance decision.
          </p>
        </div>

        <button
          type="button"
          className="finance-secondary-button"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="finance-metric-grid">
        <article>
          <Clock3 size={17} />
          <div>
            <span>Pending</span>
            <strong>{pending.length}</strong>
          </div>
        </article>

        <article>
          <ShieldCheck size={17} />
          <div>
            <span>Pending value</span>
            <strong>
              {money(
                pendingValue,
                pending[0]?.currency ||
                  "GBP"
              )}
            </strong>
          </div>
        </article>

        <article>
          <CheckCircle2 size={17} />
          <div>
            <span>Approved history</span>
            <strong>
              {
                history.filter(
                  (item) =>
                    item.decision ===
                    "Approved"
                ).length
              }
            </strong>
          </div>
        </article>

        <article>
          <XCircle size={17} />
          <div>
            <span>Rejected history</span>
            <strong>
              {
                history.filter(
                  (item) =>
                    item.decision ===
                    "Rejected"
                ).length
              }
            </strong>
          </div>
        </article>
      </div>

      <div className="finance-toolbar">
        <div className="finance-tabs">
          <button
            type="button"
            className={
              tab === "pending"
                ? "active"
                : ""
            }
            onClick={() =>
              setTab("pending")
            }
          >
            Pending
            <span>{pending.length}</span>
          </button>

          <button
            type="button"
            className={
              tab === "history"
                ? "active"
                : ""
            }
            onClick={() =>
              setTab("history")
            }
          >
            Decision history
            <span>{history.length}</span>
          </button>
        </div>

        <div className="finance-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search approval queue..."
          />
        </div>
      </div>

      {!filtered.length ? (
        <div className="finance-empty">
          <FileCheck2 size={27} />

          <strong>
            {tab === "pending"
              ? "No invoices awaiting approval"
              : "No approval decisions found"}
          </strong>

          <p>
            {tab === "pending"
              ? "Invoices appear here after they pass the configured matching controls."
              : "Approval and rejection decisions will appear here."}
          </p>
        </div>
      ) : (
        <div className="finance-table-wrapper">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Supplier</th>
                <th>PO</th>
                <th>Total</th>

                {tab === "pending" ? (
                  <>
                    <th>Match</th>
                    <th>Exceptions</th>
                    <th>Action</th>
                  </>
                ) : (
                  <>
                    <th>Decision</th>
                    <th>Type</th>
                    <th>Approver</th>
                  </>
                )}
              </tr>
            </thead>

            <tbody>
              {filtered.map((item) => (
                <tr
                  key={
                    item.id ||
                    item.invoiceId
                  }
                >
                  <td>
                    <div className="finance-primary-cell">
                      <FileCheck2 size={15} />

                      <div>
                        <strong>
                          {item.invoiceNumber}
                        </strong>

                        <small>
                          {item.invoiceDate ||
                            "Finance invoice"}
                        </small>
                      </div>
                    </div>
                  </td>

                  <td>
                    {item.supplierName}
                  </td>

                  <td>
                    {item.purchaseOrderNumber ||
                      "—"}
                  </td>

                  <td>
                    <strong>
                      {money(
                        item.totalAmount,
                        item.currency
                      )}
                    </strong>
                  </td>

                  {tab === "pending" ? (
                    <>
                      <td>
                        <div className="finance-match-cell">
                          <Status
                            value={
                              item.matchStatus
                            }
                          />
                          <small>
                            {Number(
                              item.matchScore ||
                                0
                            ).toFixed(1)}
                            %
                          </small>
                        </div>
                      </td>

                      <td>
                        <span className="finance-zero">
                          {
                            item.openExceptionCount
                          }
                        </span>
                      </td>

                      <td>
                        <div className="finance-row-actions">
                          <button
                            type="button"
                            className="finance-approve-button"
                            disabled={
                              working ===
                              item.invoiceId
                            }
                            onClick={() => {
                              setDecision({
                                invoiceId:
                                  item.invoiceId,
                                value:
                                  "Approved",
                                invoiceNumber:
                                  item.invoiceNumber,
                              });

                              setComments(
                                "Reviewed and approved."
                              );
                            }}
                          >
                            <CheckCircle2
                              size={14}
                            />
                            Approve
                          </button>

                          <button
                            type="button"
                            className="finance-reject-button"
                            disabled={
                              working ===
                              item.invoiceId
                            }
                            onClick={() => {
                              setDecision({
                                invoiceId:
                                  item.invoiceId,
                                value:
                                  "Rejected",
                                invoiceNumber:
                                  item.invoiceNumber,
                              });

                              setComments(
                                "Rejected during manual review."
                              );
                            }}
                          >
                            <XCircle
                              size={14}
                            />
                            Reject
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <Status
                          value={
                            item.decision
                          }
                        />
                      </td>

                      <td>
                        {item.approvalType}
                      </td>

                      <td>
                        {item.approver ||
                          "System"}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {decision && (
        <div
          className="finance-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setDecision(null);
            }
          }}
        >
          <div className="finance-modal finance-modal-enter">
            <div className="finance-modal-icon">
              {decision.value ===
              "Approved" ? (
                <CheckCircle2 size={21} />
              ) : (
                <XCircle size={21} />
              )}
            </div>

            <span className="finance-eyebrow">
              Finance decision
            </span>

            <h3>
              {decision.value}{" "}
              {decision.invoiceNumber}?
            </h3>

            <p>
              This decision will be stored in
              the approval record and audit
              trail.
            </p>

            <label>
              Review comments
              <textarea
                value={comments}
                onChange={(event) =>
                  setComments(
                    event.target.value
                  )
                }
                rows="4"
                autoFocus
              />
            </label>

            <div className="finance-modal-actions">
              <button
                type="button"
                className="finance-secondary-button"
                onClick={() =>
                  setDecision(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className={
                  decision.value ===
                  "Approved"
                    ? "finance-primary-button"
                    : "finance-danger-button"
                }
                disabled={
                  working ===
                  decision.invoiceId
                }
                onClick={
                  confirmDecision
                }
              >
                {working ===
                decision.invoiceId
                  ? "Saving..."
                  : `Confirm ${decision.value}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
