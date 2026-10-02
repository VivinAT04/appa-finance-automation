import {
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  FileWarning,
  RefreshCw,
  Search,
} from "lucide-react";

import "./FinanceOperations.css";

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

function humanize(value) {
  return String(value || "")
    .replaceAll("_", " ");
}

function Severity({ value }) {
  const key =
    String(value || "Medium")
      .toLowerCase();

  return (
    <span
      className={`finance-severity finance-severity-${key}`}
    >
      {value || "Medium"}
    </span>
  );
}

export default function ExceptionWorkbench({
  rows: rawRows,
  working,
  onRefresh,
  onResolve,
}) {
  const rows = useMemo(
    () => (Array.isArray(rawRows) ? rawRows : []),
    [rawRows]
  );
  const [query, setQuery] =
    useState("");

  const [filter, setFilter] =
    useState("Open");

  const [selected, setSelected] =
    useState(null);

  const [resolution, setResolution] =
    useState("");

  const open = rows.filter(
    (item) => item.status === "Open"
  );

  const high = open.filter(
    (item) =>
      String(item.severity)
        .toLowerCase() === "high"
  );

  const affectedInvoices =
    new Set(
      open.map(
        (item) => item.invoiceId
      )
    ).size;

  const filtered = useMemo(() => {
    const q =
      query.trim().toLowerCase();

    return rows.filter((item) => {
      const matchesStatus =
        filter === "All" ||
        item.status === filter;

      const matchesSearch =
        !q ||
        [
          item.exceptionType,
          item.invoiceNumber,
          item.supplierName,
          item.description,
          item.severity,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value)
              .toLowerCase()
              .includes(q)
          );

      return (
        matchesStatus &&
        matchesSearch
      );
    });
  }, [rows, query, filter]);

  async function confirmResolution() {
    if (
      !selected ||
      !resolution.trim()
    ) {
      return;
    }

    await onResolve(
      selected.id,
      resolution.trim()
    );

    setSelected(null);
    setResolution("");
  }

  return (
    <section className="panel finance-panel finance-enter">
      <div className="finance-header">
        <div>
          <span className="finance-eyebrow">
            APPA Finance Operations
          </span>

          <h2>Exception Workbench</h2>

          <p>
            Investigate failed AP controls,
            document resolutions and maintain
            a traceable operational history.
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
          <AlertTriangle size={17} />
          <div>
            <span>Open exceptions</span>
            <strong>{open.length}</strong>
          </div>
        </article>

        <article>
          <CircleAlert size={17} />
          <div>
            <span>High severity</span>
            <strong>{high.length}</strong>
          </div>
        </article>

        <article>
          <FileWarning size={17} />
          <div>
            <span>Affected invoices</span>
            <strong>
              {affectedInvoices}
            </strong>
          </div>
        </article>

        <article>
          <CheckCircle2 size={17} />
          <div>
            <span>Resolved</span>
            <strong>
              {
                rows.filter(
                  (item) =>
                    item.status ===
                    "Resolved"
                ).length
              }
            </strong>
          </div>
        </article>
      </div>

      <div className="finance-toolbar">
        <div className="finance-tabs">
          {[
            "Open",
            "Resolved",
            "All",
          ].map((value) => (
            <button
              key={value}
              type="button"
              className={
                filter === value
                  ? "active"
                  : ""
              }
              onClick={() =>
                setFilter(value)
              }
            >
              {value}
            </button>
          ))}
        </div>

        <div className="finance-search">
          <Search size={14} />

          <input
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search exceptions..."
          />
        </div>
      </div>

      {!filtered.length ? (
        <div className="finance-empty">
          <CheckCircle2 size={27} />

          <strong>
            No exceptions found
          </strong>

          <p>
            No records match the selected
            status and search criteria.
          </p>
        </div>
      ) : (
        <div className="finance-exception-grid">
          {filtered.map((item) => (
            <article
              className="finance-exception-card"
              key={item.id}
            >
              <div className="finance-exception-top">
                <div className="finance-warning-icon">
                  <AlertTriangle
                    size={17}
                  />
                </div>

                <div className="finance-exception-title">
                  <strong>
                    {humanize(
                      item.exceptionType
                    )}
                  </strong>

                  <span>
                    {item.invoiceNumber}
                  </span>
                </div>

                <Severity
                  value={item.severity}
                />
              </div>

              <p className="finance-exception-description">
                {item.description}
              </p>

              <div className="finance-exception-info">
                <div>
                  <span>Supplier</span>
                  <strong>
                    {item.supplierName}
                  </strong>
                </div>

                <div>
                  <span>Invoice value</span>
                  <strong>
                    {money(
                      item.totalAmount,
                      item.currency
                    )}
                  </strong>
                </div>

                <div>
                  <span>Status</span>
                  <strong>
                    {item.status}
                  </strong>
                </div>
              </div>

              {item.resolution && (
                <div className="finance-resolution-box">
                  <span>Resolution</span>
                  <p>{item.resolution}</p>
                </div>
              )}

              {item.status === "Open" && (
                <button
                  type="button"
                  className="finance-primary-button finance-full-button"
                  disabled={
                    working === item.id
                  }
                  onClick={() => {
                    setSelected(item);
                    setResolution("");
                  }}
                >
                  <CheckCircle2
                    size={14}
                  />
                  Resolve Exception
                </button>
              )}
            </article>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="finance-modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelected(null);
            }
          }}
        >
          <div className="finance-modal finance-modal-enter">
            <div className="finance-modal-icon finance-modal-warning">
              <AlertTriangle size={21} />
            </div>

            <span className="finance-eyebrow">
              Exception resolution
            </span>

            <h3>
              {humanize(
                selected.exceptionType
              )}
            </h3>

            <p>
              {selected.invoiceNumber} ·{" "}
              {selected.supplierName}
            </p>

            <div className="finance-modal-context">
              {selected.description}
            </div>

            <label>
              Resolution note
              <textarea
                value={resolution}
                onChange={(event) =>
                  setResolution(
                    event.target.value
                  )
                }
                rows="5"
                placeholder="Describe what was checked and how the exception was resolved..."
                autoFocus
              />
            </label>

            <div className="finance-modal-actions">
              <button
                type="button"
                className="finance-secondary-button"
                onClick={() =>
                  setSelected(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="finance-primary-button"
                disabled={
                  !resolution.trim() ||
                  working ===
                    selected.id
                }
                onClick={
                  confirmResolution
                }
              >
                {working ===
                selected.id
                  ? "Resolving..."
                  : "Confirm Resolution"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
