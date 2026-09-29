import {
  useMemo,
  useState,
} from "react";

import {
  Building2,
  CheckCircle2,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";

import "./ProcurementOperations.css";

function paymentTerms(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const text =
    String(value).trim();

  if (
    text.toLowerCase().includes("day")
  ) {
    return text;
  }

  return `${text} days`;
}

export default function SupplierOperations({
  rows = [],
  onRefresh,
}) {
  const [query, setQuery] =
    useState("");

  const filtered = useMemo(() => {
    const q =
      query.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((supplier) =>
      [
        supplier.supplierCode,
        supplier.name,
        supplier.email,
        supplier.taxId,
        supplier.status,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(q)
        )
    );
  }, [rows, query]);

  const activeCount =
    rows.filter(
      (supplier) =>
        supplier.status === "Active"
    ).length;

  return (
    <section className="panel procurement-panel procurement-enter">
      <div className="procurement-header">
        <div>
          <span className="procurement-eyebrow">
            Supplier Master Data
          </span>

          <h2>Suppliers</h2>

          <p>
            Review supplier identities,
            payment terms and reference data
            used by APPA's AP controls.
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

      <div className="procurement-metric-grid procurement-three-metrics">
        <article>
          <Building2 size={17} />

          <div>
            <span>Suppliers</span>
            <strong>
              {rows.length}
            </strong>
          </div>
        </article>

        <article>
          <CheckCircle2 size={17} />

          <div>
            <span>Active</span>
            <strong>
              {activeCount}
            </strong>
          </div>
        </article>

        <article>
          <ShieldCheck size={17} />

          <div>
            <span>Master data</span>

            <strong>
              {rows.length
                ? "Available"
                : "Empty"}
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
            placeholder="Search supplier, code, email or tax ID..."
          />
        </div>

        <span className="procurement-result-count">
          {filtered.length} of{" "}
          {rows.length} suppliers
        </span>
      </div>

      {!filtered.length ? (
        <div className="procurement-large-empty">
          <Building2 size={27} />

          <strong>
            No suppliers found
          </strong>

          <p>
            No supplier records match the
            current search.
          </p>
        </div>
      ) : (
        <div className="supplier-grid">
          {filtered.map(
            (supplier) => (
              <article
                className="supplier-card"
                key={supplier.id}
              >
                <div className="supplier-card-top">
                  <div className="supplier-identity">
                    <div className="supplier-icon">
                      <Building2
                        size={18}
                      />
                    </div>

                    <div>
                      <strong>
                        {supplier.name}
                      </strong>

                      <span>
                        {
                          supplier.supplierCode
                        }
                      </span>
                    </div>
                  </div>

                  <span
                    className={[
                      "procurement-status",
                      supplier.status ===
                      "Active"
                        ? "procurement-status-positive"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {supplier.status}
                  </span>
                </div>

                <div className="supplier-detail-list">
                  <div>
                    <span>Email</span>

                    <strong>
                      <Mail size={12} />
                      {supplier.email ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>Tax ID</span>

                    <strong>
                      {supplier.taxId ||
                        "—"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Payment terms
                    </span>

                    <strong>
                      {paymentTerms(
                        supplier.paymentTermsDays
                      )}
                    </strong>
                  </div>
                </div>
              </article>
            )
          )}
        </div>
      )}
    </section>
  );
}
