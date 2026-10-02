import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  XCircle,
} from "lucide-react";

import {
  getInvoice,
  getInvoiceMatch,
  getExceptions,
  getApprovals,
} from "../api";

import "./InvoiceOperations.css";

function money(value, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || "INR"} ${Number(
      value || 0
    ).toFixed(2)}`;
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

function statusClass(value) {
  const normalized = String(
    value || ""
  ).toLowerCase();

  if (
    [
      "validated",
      "matched",
      "approved",
      "completed",
      "resolved",
    ].includes(normalized)
  ) {
    return "invoice-status-positive";
  }

  if (
    [
      "exception",
      "rejected",
      "failed",
      "open",
    ].includes(normalized)
  ) {
    return "invoice-status-danger";
  }

  return "";
}

function Status({ children }) {
  return (
    <span
      className={[
        "invoice-status",
        statusClass(children),
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children || "Unknown"}
    </span>
  );
}

function CheckItem({
  label,
  value,
}) {
  const passed =
    value === true ||
    value === 1;

  return (
    <div
      className={[
        "invoice-check",
        passed
          ? "invoice-check-pass"
          : "invoice-check-fail",
      ].join(" ")}
    >
      <div className="invoice-check-icon">
        {passed ? (
          <CheckCircle2 size={16} />
        ) : (
          <XCircle size={16} />
        )}
      </div>

      <div>
        <span>{label}</span>
        <strong>
          {passed ? "Passed" : "Failed"}
        </strong>
      </div>
    </div>
  );
}

function DetailField({
  label,
  value,
  strong = false,
}) {
  return (
    <div className="invoice-detail-field">
      <span>{label}</span>

      {strong ? (
        <strong>{value ?? "—"}</strong>
      ) : (
        <p>{value ?? "—"}</p>
      )}
    </div>
  );
}

export default function InvoiceOperations({
  rows,
  working,
  onRefresh,
  onMatch,
}) {
  const safeRows = useMemo(
    () => (Array.isArray(rows) ? rows : []),
    [rows]
  );

  const [selectedId, setSelectedId] =
    useState(null);

  const [invoice, setInvoice] =
    useState(null);

  const [match, setMatch] =
    useState(null);

  const [exceptions, setExceptions] =
    useState([]);

  const [approvals, setApprovals] =
    useState([]);

  const [detailLoading, setDetailLoading] =
    useState(false);

  const [detailError, setDetailError] =
    useState("");

  const [query, setQuery] =
    useState("");

  const filteredRows = useMemo(() => {
    const normalized =
      query.trim().toLowerCase();

    if (!normalized) {
      return safeRows;
    }

    return safeRows.filter((item) =>
      [
        item.invoiceNumber,
        item.supplierName,
        item.purchaseOrderNumber,
        item.validationStatus,
        item.currency,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(normalized)
        )
    );
  }, [safeRows, query]);

  async function loadDetail(id) {
    setSelectedId(id);
    setDetailLoading(true);
    setDetailError("");

    try {
      const [
        invoiceData,
        exceptionData,
        approvalData,
      ] = await Promise.all([
        getInvoice(id),
        getExceptions(),
        getApprovals(),
      ]);

      let matchData = null;

      try {
        matchData =
          await getInvoiceMatch(id);
      } catch (error) {
        if (
          error?.response?.status !== 404
        ) {
          throw error;
        }
      }

      setInvoice(invoiceData);
      setMatch(matchData);

      const safeExceptionData =
        Array.isArray(exceptionData)
          ? exceptionData
          : [];

      const safeApprovalData =
        Array.isArray(approvalData)
          ? approvalData
          : [];

      setExceptions(
        safeExceptionData.filter(
          (item) =>
            item.invoiceId === id
        )
      );

      setApprovals(
        safeApprovalData.filter(
          (item) =>
            item.invoiceId === id
        )
      );
    } catch (error) {
      setDetailError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to load invoice details."
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function runMatch() {
    if (!selectedId) return;

    await onMatch(selectedId);
    await loadDetail(selectedId);
  }

  useEffect(() => {
    if (
      selectedId &&
      !safeRows.some(
        (item) =>
          item.id === selectedId
      )
    ) {
      setSelectedId(null);
      setInvoice(null);
      setMatch(null);
      setExceptions([]);
      setApprovals([]);
    }
  }, [
    rows, selectedId,
    safeRows,
  ]);

  if (selectedId) {
    return (
      <section className="panel invoice-ops-panel">
        <div className="invoice-detail-toolbar">
          <button
            type="button"
            className="invoice-back-button"
            onClick={() => {
              setSelectedId(null);
              setInvoice(null);
              setMatch(null);
              setExceptions([]);
              setApprovals([]);
              setDetailError("");
            }}
          >
            <ArrowLeft size={16} />
            All invoices
          </button>

          <div className="invoice-detail-actions">
            <button
              type="button"
              className="invoice-secondary-button"
              onClick={() =>
                loadDetail(selectedId)
              }
              disabled={detailLoading}
            >
              <RefreshCw
                size={15}
                className={
                  detailLoading
                    ? "invoice-spin"
                    : ""
                }
              />
              Refresh
            </button>

            <button
              type="button"
              className="invoice-primary-button"
              disabled={
                working === selectedId ||
                detailLoading
              }
              onClick={runMatch}
            >
              <ShieldCheck size={15} />

              {working === selectedId
                ? "Matching..."
                : match
                  ? "Re-run Match"
                  : "Run PO Match"}
            </button>
          </div>
        </div>

        {detailError && (
          <div className="invoice-error-banner">
            <AlertTriangle size={17} />
            {detailError}
          </div>
        )}

        {detailLoading && !invoice ? (
          <div className="invoice-detail-loading">
            <RefreshCw
              size={20}
              className="invoice-spin"
            />
            Loading invoice workspace...
          </div>
        ) : invoice ? (
          <>
            <div className="invoice-detail-hero">
              <div>
                <span className="invoice-eyebrow">
                  Invoice Operations
                </span>

                <div className="invoice-title-row">
                  <h2>
                    {invoice.invoiceNumber ||
                      "Invoice"}
                  </h2>

                  <Status>
                    {match?.matchStatus ||
                      invoice.validationStatus}
                  </Status>
                </div>

                <p>
                  {invoice.supplierName ||
                    "Unknown supplier"}
                </p>
              </div>

              <div className="invoice-hero-total">
                <span>Total payable</span>

                <strong>
                  {money(
                    invoice.totalAmount,
                    invoice.currency
                  )}
                </strong>

                <small>
                  {invoice.currency || "INR"}
                </small>
              </div>
            </div>

            <div className="invoice-summary-grid">
              <article>
                <span>PO reference</span>
                <strong>
                  {invoice.purchaseOrderNumber ||
                    "Missing"}
                </strong>
              </article>

              <article>
                <span>
                  Extraction confidence
                </span>
                <strong>
                  {invoice.extractionConfidence ??
                    0}
                  %
                </strong>
              </article>

              <article>
                <span>Validation</span>
                <Status>
                  {invoice.validationStatus}
                </Status>
              </article>

              <article>
                <span>Match score</span>
                <strong>
                  {match
                    ? `${Number(
                        match.matchScore || 0
                      ).toFixed(2)}%`
                    : "Not run"}
                </strong>
              </article>

              <article>
                <span>Open exceptions</span>
                <strong>
                  {
                    exceptions.filter(
                      (item) =>
                        item.status ===
                        "Open"
                    ).length
                  }
                </strong>
              </article>

              <article>
                <span>Latest approval</span>
                {approvals[0] ? (
                  <Status>
                    {approvals[0].decision}
                  </Status>
                ) : (
                  <strong>Pending</strong>
                )}
              </article>
            </div>

            <div className="invoice-workspace-grid">
              <div className="invoice-workspace-main">
                <article className="invoice-section-card">
                  <div className="invoice-section-heading">
                    <div>
                      <span>
                        Invoice information
                      </span>
                      <h3>
                        Supplier & document
                      </h3>
                    </div>

                    <FileCheck2 size={19} />
                  </div>

                  <div className="invoice-information-grid">
                    <DetailField
                      label="Supplier"
                      value={
                        invoice.supplierName
                      }
                      strong
                    />

                    <DetailField
                      label="Supplier email"
                      value={
                        invoice.supplierEmail
                      }
                    />

                    <DetailField
                      label="Tax ID"
                      value={
                        invoice.supplierTaxId
                      }
                    />

                    <DetailField
                      label="Purchase order"
                      value={
                        invoice.purchaseOrderNumber ||
                        "Missing"
                      }
                      strong
                    />

                    <DetailField
                      label="Invoice date"
                      value={
                        invoice.invoiceDate
                      }
                    />

                    <DetailField
                      label="Due date"
                      value={
                        invoice.dueDate
                      }
                    />
                  </div>
                </article>

                <article className="invoice-section-card">
                  <div className="invoice-section-heading">
                    <div>
                      <span>
                        Extracted data
                      </span>
                      <h3>
                        Invoice line items
                      </h3>
                    </div>

                    <ShoppingCart size={19} />
                  </div>

                  {!invoice.lineItems?.length ? (
                    <div className="invoice-empty">
                      No invoice line items.
                    </div>
                  ) : (
                    <div className="invoice-lines-wrapper">
                      <table className="invoice-lines-table">
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Unit price</th>
                            <th>Tax</th>
                            <th>Total</th>
                          </tr>
                        </thead>

                        <tbody>
                          {invoice.lineItems.map(
                            (item) => (
                              <tr key={item.id}>
                                <td>
                                  <strong>
                                    {item.description}
                                  </strong>
                                </td>

                                <td>
                                  {item.quantity}
                                </td>

                                <td>
                                  {money(
                                    item.unitPrice,
                                    invoice.currency
                                  )}
                                </td>

                                <td>
                                  {item.taxRate ??
                                    0}
                                  %
                                </td>

                                <td>
                                  <strong>
                                    {money(
                                      item.lineTotal,
                                      invoice.currency
                                    )}
                                  </strong>
                                </td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="invoice-totals">
                    <div>
                      <span>Subtotal</span>
                      <strong>
                        {money(
                          invoice.subtotal,
                          invoice.currency
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>Tax</span>
                      <strong>
                        {money(
                          invoice.taxAmount,
                          invoice.currency
                        )}
                      </strong>
                    </div>

                    <div className="invoice-grand-total">
                      <span>Total</span>
                      <strong>
                        {money(
                          invoice.totalAmount,
                          invoice.currency
                        )}
                      </strong>
                    </div>
                  </div>
                </article>

                <article className="invoice-section-card">
                  <div className="invoice-section-heading">
                    <div>
                      <span>
                        Control framework
                      </span>
                      <h3>
                        Seven-check PO match
                      </h3>
                    </div>

                    <ShieldCheck size={19} />
                  </div>

                  {!match ? (
                    <div className="invoice-empty invoice-match-empty">
                      <ShieldCheck size={23} />

                      <div>
                        <strong>
                          Matching has not been
                          executed
                        </strong>

                        <p>
                          Run the PO match to
                          compare supplier,
                          reference, currency,
                          amounts and line items.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="invoice-match-overview">
                        <div>
                          <span>
                            Match result
                          </span>

                          <Status>
                            {match.matchStatus}
                          </Status>
                        </div>

                        <div>
                          <span>
                            Match score
                          </span>

                          <strong>
                            {Number(
                              match.matchScore ||
                                0
                            ).toFixed(2)}
                            %
                          </strong>
                        </div>

                        <div>
                          <span>
                            Variance
                          </span>

                          <strong>
                            {money(
                              match.varianceAmount,
                              invoice.currency
                            )}
                          </strong>
                        </div>
                      </div>

                      <div className="invoice-check-grid">
                        <CheckItem
                          label="Supplier"
                          value={
                            match.supplierMatch
                          }
                        />

                        <CheckItem
                          label="PO reference"
                          value={
                            match.poReferenceMatch
                          }
                        />

                        <CheckItem
                          label="Currency"
                          value={
                            match.currencyMatch
                          }
                        />

                        <CheckItem
                          label="Subtotal"
                          value={
                            match.subtotalMatch
                          }
                        />

                        <CheckItem
                          label="Tax"
                          value={
                            match.taxMatch
                          }
                        />

                        <CheckItem
                          label="Total"
                          value={
                            match.totalMatch
                          }
                        />

                        <CheckItem
                          label="Line items"
                          value={
                            match.lineItemsMatch
                          }
                        />
                      </div>
                    </>
                  )}
                </article>
              </div>

              <aside className="invoice-workspace-side">
                <article className="invoice-section-card">
                  <div className="invoice-section-heading">
                    <div>
                      <span>
                        Workflow state
                      </span>
                      <h3>Exceptions</h3>
                    </div>

                    <AlertTriangle size={19} />
                  </div>

                  {!exceptions.length ? (
                    <div className="invoice-good-state">
                      <CheckCircle2 size={19} />

                      <div>
                        <strong>
                          No exceptions
                        </strong>
                        <p>
                          No workflow exceptions
                          are associated with this
                          invoice.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="invoice-event-list">
                      {exceptions.map(
                        (item) => (
                          <div
                            className="invoice-event"
                            key={item.id}
                          >
                            <div className="invoice-event-top">
                              <strong>
                                {String(
                                  item.exceptionType
                                ).replaceAll(
                                  "_",
                                  " "
                                )}
                              </strong>

                              <Status>
                                {item.status}
                              </Status>
                            </div>

                            <p>
                              {item.description}
                            </p>

                            <small>
                              Severity:{" "}
                              {item.severity}
                            </small>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </article>

                <article className="invoice-section-card">
                  <div className="invoice-section-heading">
                    <div>
                      <span>
                        Decision history
                      </span>
                      <h3>Approvals</h3>
                    </div>

                    <CheckCircle2 size={19} />
                  </div>

                  {!approvals.length ? (
                    <div className="invoice-empty">
                      No approval decision has
                      been recorded.
                    </div>
                  ) : (
                    <div className="invoice-event-list">
                      {approvals.map(
                        (item) => (
                          <div
                            className="invoice-event"
                            key={item.id}
                          >
                            <div className="invoice-event-top">
                              <strong>
                                {item.approvalType}
                              </strong>

                              <Status>
                                {item.decision}
                              </Status>
                            </div>

                            <p>
                              {item.comments ||
                                "No comments recorded."}
                            </p>

                            <small>
                              {item.approver ||
                                "System"}{" "}
                              ·{" "}
                              {formatDate(
                                item.createdAt
                              )}
                            </small>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </article>

                <article className="invoice-section-card invoice-control-card">
                  <span className="invoice-control-label">
                    Operational control
                  </span>

                  <strong>
                    {match?.matchStatus ===
                    "Matched"
                      ? "Invoice cleared matching controls"
                      : match?.matchStatus ===
                          "Exception"
                        ? "Invoice requires exception review"
                        : "Invoice awaiting PO matching"}
                  </strong>

                  <p>
                    {match?.matchStatus ===
                    "Matched"
                      ? "All configured matching checks passed. Review the approval history for the resulting decision."
                      : match?.matchStatus ===
                          "Exception"
                        ? "One or more controls failed. Review the exception records before continuing the finance workflow."
                        : "Execute the PO matching engine to establish the invoice control status."}
                  </p>
                </article>
              </aside>
            </div>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section className="panel invoice-ops-panel">
      <div className="invoice-list-header">
        <div>
          <span className="invoice-eyebrow">
            APPA Finance Operations
          </span>

          <h2>Invoices</h2>

          <p>
            Review extracted invoices, inspect
            matching controls and investigate
            exceptions from one operational
            workspace.
          </p>
        </div>

        <button
          type="button"
          className="invoice-secondary-button"
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>

      <div className="invoice-list-summary">
        <article>
          <span>Total invoices</span>
          <strong>{safeRows.length}</strong>
        </article>

        <article>
          <span>Validated</span>
          <strong>
            {
              safeRows.filter(
                (item) =>
                  item.validationStatus ===
                  "Validated"
              ).length
            }
          </strong>
        </article>

        <article>
          <span>Invoice value</span>
          <strong>
            {money(
              safeRows.reduce(
                (sum, item) =>
                  sum +
                  Number(
                    item.totalAmount || 0
                  ),
                0
              ),
              safeRows[0]?.currency || "INR"
            )}
          </strong>
        </article>

        <article>
          <span>Missing PO</span>
          <strong>
            {
              safeRows.filter(
                (item) =>
                  !item.purchaseOrderNumber
              ).length
            }
          </strong>
        </article>
      </div>

      <div className="invoice-search-row">
        <div className="invoice-search">
          <Search size={15} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search invoice, supplier or PO..."
          />
        </div>

        <span>
          {filteredRows.length} result
          {filteredRows.length === 1
            ? ""
            : "s"}
        </span>
      </div>

      {!filteredRows.length ? (
        <div className="invoice-empty invoice-list-empty">
          <FileCheck2 size={25} />

          <strong>
            No invoices found
          </strong>

          <p>
            Try a different search or process
            an invoice from Documents.
          </p>
        </div>
      ) : (
        <div className="invoice-table-wrapper">
          <table className="invoice-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Supplier</th>
                <th>PO</th>
                <th>Confidence</th>
                <th>Total</th>
                <th>Validation</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {filteredRows.map(
                (item) => (
                  <tr
                    key={item.id}
                    onClick={() =>
                      loadDetail(item.id)
                    }
                  >
                    <td>
                      <div className="invoice-table-primary">
                        <FileCheck2
                          size={16}
                        />

                        <div>
                          <strong>
                            {item.invoiceNumber ||
                              "Invoice"}
                          </strong>

                          <small>
                            {item.invoiceDate ||
                              "No date"}
                          </small>
                        </div>
                      </div>
                    </td>

                    <td>
                      {item.supplierName ||
                        "Unknown"}
                    </td>

                    <td>
                      {item.purchaseOrderNumber ? (
                        <strong>
                          {
                            item.purchaseOrderNumber
                          }
                        </strong>
                      ) : (
                        <span className="invoice-missing-po">
                          Missing
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="invoice-confidence">
                        <div>
                          <span
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  0,
                                  Number(
                                    item.extractionConfidence ||
                                      0
                                  )
                                )
                              )}%`,
                            }}
                          />
                        </div>

                        <strong>
                          {item.extractionConfidence ??
                            0}
                          %
                        </strong>
                      </div>
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
                      <Status>
                        {item.validationStatus}
                      </Status>
                    </td>

                    <td>
                      <ChevronRight
                        size={17}
                        className="invoice-row-arrow"
                      />
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
