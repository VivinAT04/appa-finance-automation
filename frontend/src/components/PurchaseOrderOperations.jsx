import {
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileCheck2,
  PackageCheck,
  RefreshCw,
  Search,
  ShoppingCart,
} from "lucide-react";

import {
  getPurchaseOrder,
} from "../api";

import "./ProcurementOperations.css";

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

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  ).format(parsed);
}

function Status({ value }) {
  const normalized =
    String(value || "").toLowerCase();

  const positive = [
    "matched",
    "approved",
    "completed",
    "closed",
  ].includes(normalized);

  const warning = [
    "open",
    "pending",
  ].includes(normalized);

  return (
    <span
      className={[
        "procurement-status",
        positive
          ? "procurement-status-positive"
          : "",
        warning
          ? "procurement-status-warning"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {value || "Unknown"}
    </span>
  );
}

function SummaryField({
  label,
  value,
}) {
  return (
    <div className="procurement-summary-field">
      <span>{label}</span>
      <strong>{value ?? "—"}</strong>
    </div>
  );
}

export default function PurchaseOrderOperations({
  rows = [],
  onRefresh,
}) {
  const [query, setQuery] =
    useState("");

  const [selected, setSelected] =
    useState(null);

  const [loadingId, setLoadingId] =
    useState("");

  const [error, setError] =
    useState("");

  const filtered = useMemo(() => {
    const q =
      query.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((po) =>
      [
        po.poNumber,
        po.supplierName,
        po.supplierCode,
        po.status,
        po.currency,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(q)
        )
    );
  }, [rows, query]);

  const openCount =
    rows.filter(
      (po) => po.status === "Open"
    ).length;

  const matchedCount =
    rows.filter(
      (po) => po.status === "Matched"
    ).length;

  const totalValue =
    rows.reduce(
      (sum, po) =>
        sum +
        Number(po.totalAmount || 0),
      0
    );

  async function openPO(id) {
    setLoadingId(id);
    setError("");

    try {
      const po =
        await getPurchaseOrder(id);

      setSelected(po);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load purchase order."
      );
    } finally {
      setLoadingId("");
    }
  }

  async function refreshDetail() {
    if (!selected?.id) return;

    await openPO(selected.id);
  }

  if (selected) {
    const items =
      selected.lineItems || [];

    return (
      <section className="panel procurement-panel procurement-enter">
        <div className="procurement-detail-toolbar">
          <button
            type="button"
            className="procurement-back-button"
            onClick={() => {
              setSelected(null);
              setError("");
            }}
          >
            <ArrowLeft size={15} />
            Purchase Orders
          </button>

          <button
            type="button"
            className="procurement-secondary-button"
            onClick={refreshDetail}
            disabled={
              loadingId === selected.id
            }
          >
            <RefreshCw
              size={14}
              className={
                loadingId === selected.id
                  ? "procurement-spin"
                  : ""
              }
            />
            Refresh
          </button>
        </div>

        <div className="procurement-detail-hero">
          <div>
            <span className="procurement-eyebrow">
              Procurement Record
            </span>

            <div className="procurement-title-line">
              <h2>
                {selected.poNumber}
              </h2>

              <Status
                value={selected.status}
              />
            </div>

            <p>
              {selected.supplierName}
              {selected.supplierCode
                ? ` · ${selected.supplierCode}`
                : ""}
            </p>
          </div>

          <div className="procurement-hero-total">
            <span>Total commitment</span>

            <strong>
              {money(
                selected.totalAmount,
                selected.currency
              )}
            </strong>

            <small>
              {selected.currency}
            </small>
          </div>
        </div>

        {error && (
          <div className="procurement-error">
            {error}
          </div>
        )}

        <div className="procurement-summary-grid">
          <SummaryField
            label="Supplier"
            value={selected.supplierName}
          />

          <SummaryField
            label="Supplier code"
            value={selected.supplierCode}
          />

          <SummaryField
            label="Order date"
            value={formatDate(
              selected.orderDate
            )}
          />

          <SummaryField
            label="Currency"
            value={selected.currency}
          />

          <SummaryField
            label="Status"
            value={selected.status}
          />

          <SummaryField
            label="Supplier email"
            value={selected.supplierEmail}
          />
        </div>

        <div className="procurement-detail-layout">
          <article className="procurement-card">
            <div className="procurement-card-heading">
              <div>
                <span>
                  Purchase commitment
                </span>

                <h3>
                  Line Items
                </h3>
              </div>

              <ShoppingCart size={18} />
            </div>

            {!items.length ? (
              <div className="procurement-empty">
                No line items available.
              </div>
            ) : (
              <div className="procurement-table-wrapper">
                <table className="procurement-table procurement-line-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Description</th>
                      <th>Quantity</th>
                      <th>Unit price</th>
                      <th>Line total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map(
                      (item, index) => (
                        <tr key={item.id}>
                          <td>
                            {index + 1}
                          </td>

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
                              selected.currency
                            )}
                          </td>

                          <td>
                            <strong>
                              {money(
                                item.lineTotal,
                                selected.currency
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

            <div className="procurement-totals">
              <div>
                <span>Subtotal</span>

                <strong>
                  {money(
                    selected.subtotal,
                    selected.currency
                  )}
                </strong>
              </div>

              <div>
                <span>Tax</span>

                <strong>
                  {money(
                    selected.taxAmount,
                    selected.currency
                  )}
                </strong>
              </div>

              <div className="procurement-grand-total">
                <span>Total</span>

                <strong>
                  {money(
                    selected.totalAmount,
                    selected.currency
                  )}
                </strong>
              </div>
            </div>
          </article>

          <aside className="procurement-side-column">
            <article className="procurement-card">
              <div className="procurement-card-heading">
                <div>
                  <span>
                    AP control
                  </span>

                  <h3>
                    Matching Context
                  </h3>
                </div>

                <PackageCheck size={18} />
              </div>

              <div className="procurement-control-state">
                <Status
                  value={selected.status}
                />

                <p>
                  This purchase order is
                  available to the AP matching
                  engine for invoice control
                  validation.
                </p>
              </div>

              <div className="procurement-control-list">
                <div>
                  <CheckCircle2 size={14} />
                  Supplier reference
                </div>

                <div>
                  <CheckCircle2 size={14} />
                  Currency
                </div>

                <div>
                  <CheckCircle2 size={14} />
                  Financial totals
                </div>

                <div>
                  <CheckCircle2 size={14} />
                  Line-item comparison
                </div>
              </div>
            </article>

            <article className="procurement-dark-card">
              <ClipboardCheck size={20} />

              <span>
                Controlled procurement
              </span>

              <strong>
                PO records remain separate
                from invoice extraction.
              </strong>

              <p>
                The matching layer records the
                relationship and control result
                independently for auditability.
              </p>
            </article>
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="panel procurement-panel procurement-enter">
      <div className="procurement-header">
        <div>
          <span className="procurement-eyebrow">
            Procurement Controls
          </span>

          <h2>Purchase Orders</h2>

          <p>
            Review purchasing commitments used
            by APPA's invoice matching workflow.
          </p>
        </div>

        <button
          type="button"
          className="procurement-secondary-button"
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="procurement-metric-grid">
        <article>
          <ShoppingCart size={17} />

          <div>
            <span>Total POs</span>
            <strong>
              {rows.length}
            </strong>
          </div>
        </article>

        <article>
          <FileCheck2 size={17} />

          <div>
            <span>Open</span>
            <strong>
              {openCount}
            </strong>
          </div>
        </article>

        <article>
          <PackageCheck size={17} />

          <div>
            <span>Matched</span>
            <strong>
              {matchedCount}
            </strong>
          </div>
        </article>

        <article>
          <Building2 size={17} />

          <div>
            <span>Total value</span>

            <strong>
              {money(
                totalValue,
                rows[0]?.currency ||
                  "INR"
              )}
            </strong>
          </div>
        </article>
      </div>

      <div className="procurement-toolbar">
        <div className="procurement-search">
          <Search size={14} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search PO, supplier or status..."
          />
        </div>

        <span className="procurement-result-count">
          {filtered.length} of{" "}
          {rows.length} records
        </span>
      </div>

      {error && (
        <div className="procurement-error">
          {error}
        </div>
      )}

      {!filtered.length ? (
        <div className="procurement-large-empty">
          <ShoppingCart size={27} />

          <strong>
            No purchase orders found
          </strong>

          <p>
            No procurement records match the
            current search.
          </p>
        </div>
      ) : (
        <div className="procurement-table-wrapper">
          <table className="procurement-table">
            <thead>
              <tr>
                <th>Purchase order</th>
                <th>Supplier</th>
                <th>Order date</th>
                <th>Subtotal</th>
                <th>Tax</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>

            <tbody>
              {filtered.map((po) => (
                <tr
                  key={po.id}
                  className="procurement-clickable-row"
                  onClick={() =>
                    openPO(po.id)
                  }
                >
                  <td>
                    <div className="procurement-primary-cell">
                      <ShoppingCart
                        size={15}
                      />

                      <div>
                        <strong>
                          {po.poNumber}
                        </strong>

                        <small>
                          {po.supplierCode}
                        </small>
                      </div>
                    </div>
                  </td>

                  <td>
                    {po.supplierName}
                  </td>

                  <td>
                    {formatDate(
                      po.orderDate
                    )}
                  </td>

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
                    <Status
                      value={po.status}
                    />
                  </td>

                  <td>
                    {loadingId ===
                    po.id ? (
                      <RefreshCw
                        size={15}
                        className="procurement-spin"
                      />
                    ) : (
                      <ChevronRight
                        size={15}
                        className="procurement-chevron"
                      />
                    )}
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
