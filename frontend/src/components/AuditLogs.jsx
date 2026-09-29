import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
} from "lucide-react";

import { getAuditLogs } from "../api";
import "./AuditLogs.css";

function formatAction(value = "") {
  return String(value)
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTone(action = "") {
  const value = String(action).toUpperCase();

  if (
    value.includes("FAILED") ||
    value.includes("REJECT") ||
    value.includes("EXCEPTION")
  ) {
    return "danger";
  }

  if (
    value.includes("APPROVED") ||
    value.includes("VALIDATED") ||
    value.includes("COMPLETED") ||
    value.includes("RESOLVED") ||
    value.includes("MATCHED")
  ) {
    return "success";
  }

  if (
    value.includes("UPLOAD") ||
    value.includes("EXTRACT") ||
    value.includes("PROCESS")
  ) {
    return "processing";
  }

  return "neutral";
}

function ActionIcon({ action }) {
  const value = String(action || "").toUpperCase();

  if (
    value.includes("APPROVED") ||
    value.includes("VALIDATED") ||
    value.includes("MATCHED")
  ) {
    return <ShieldCheck size={16} />;
  }

  if (
    value.includes("FAILED") ||
    value.includes("EXCEPTION") ||
    value.includes("REJECT")
  ) {
    return <AlertTriangle size={16} />;
  }

  if (
    value.includes("DOCUMENT") ||
    value.includes("INVOICE")
  ) {
    return <FileText size={16} />;
  }

  return <Activity size={16} />;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLogs() {
    setLoading(true);
    setError("");

    try {
      const data = await getAuditLogs();
      setLogs(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load audit logs."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    const search = query.trim().toLowerCase();

    if (!search) {
      return logs;
    }

    return logs.filter((log) =>
      [
        log.action,
        log.entity_type,
        log.entityType,
        log.entity_id,
        log.entityId,
        log.description,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value)
            .toLowerCase()
            .includes(search)
        )
    );
  }, [logs, query]);

  const summary = useMemo(() => {
    return {
      total: logs.length,

      successful: logs.filter(
        (log) =>
          getTone(log.action) === "success"
      ).length,

      exceptions: logs.filter(
        (log) =>
          getTone(log.action) === "danger"
      ).length,

      processing: logs.filter(
        (log) =>
          getTone(log.action) === "processing"
      ).length,
    };
  }, [logs]);

  return (
    <section className="audit-page">
      <div className="audit-heading">
        <div>
          <span className="audit-eyebrow">
            Governance & Compliance
          </span>

          <h2>Audit Logs</h2>

          <p>
            Immutable operational history across
            document intake, invoice extraction,
            matching, approvals, exceptions and
            automation.
          </p>
        </div>

        <button
          type="button"
          className="audit-refresh"
          onClick={loadLogs}
          disabled={loading}
        >
          <RefreshCw
            size={15}
            className={
              loading ? "audit-spin" : ""
            }
          />

          Refresh
        </button>
      </div>

      <div className="audit-metrics">
        <article className="audit-metric">
          <div>
            <span>Total events</span>
            <strong>{summary.total}</strong>
          </div>

          <div className="audit-metric-icon">
            <ScrollText size={18} />
          </div>
        </article>

        <article className="audit-metric">
          <div>
            <span>Successful</span>
            <strong>{summary.successful}</strong>
          </div>

          <div className="audit-metric-icon success">
            <CheckCircle2 size={18} />
          </div>
        </article>

        <article className="audit-metric">
          <div>
            <span>Processing</span>
            <strong>{summary.processing}</strong>
          </div>

          <div className="audit-metric-icon processing">
            <Clock3 size={18} />
          </div>
        </article>

        <article className="audit-metric">
          <div>
            <span>Exceptions</span>
            <strong>{summary.exceptions}</strong>
          </div>

          <div className="audit-metric-icon danger">
            <AlertTriangle size={18} />
          </div>
        </article>
      </div>

      <div className="audit-panel">
        <div className="audit-toolbar">
          <div>
            <h3>Activity history</h3>

            <p>
              Showing {filteredLogs.length} of{" "}
              {logs.length} events
            </p>
          </div>

          <label className="audit-search">
            <Search size={15} />

            <input
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search actions, entities..."
            />
          </label>
        </div>

        {error ? (
          <div className="audit-state audit-error">
            <AlertTriangle size={22} />
            <strong>{error}</strong>
          </div>
        ) : loading ? (
          <div className="audit-state">
            <RefreshCw
              size={20}
              className="audit-spin"
            />
            <strong>Loading audit trail...</strong>
          </div>
        ) : !filteredLogs.length ? (
          <div className="audit-state">
            <ScrollText size={23} />
            <strong>
              No audit events found.
            </strong>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>Timestamp</th>
                </tr>
              </thead>

              <tbody>
                {filteredLogs.map((log) => {
                  const tone =
                    getTone(log.action);

                  const entityType =
                    log.entityType ||
                    log.entity_type ||
                    "System";

                  const entityId =
                    log.entityId ||
                    log.entity_id ||
                    "";

                  const createdAt =
                    log.createdAt ||
                    log.created_at;

                  return (
                    <tr key={log.id}>
                      <td>
                        <div className="audit-event">
                          <span
                            className={`audit-event-icon ${tone}`}
                          >
                            <ActionIcon
                              action={log.action}
                            />
                          </span>

                          <div>
                            <strong>
                              {formatAction(
                                log.action
                              )}
                            </strong>

                            <small>
                              {log.action}
                            </small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="audit-entity">
                          <strong>
                            {formatAction(
                              entityType
                            )}
                          </strong>

                          {entityId && (
                            <small>
                              {String(entityId)
                                .slice(0, 18)}
                              {String(entityId)
                                .length > 18
                                ? "…"
                                : ""}
                            </small>
                          )}
                        </div>
                      </td>

                      <td>
                        <span className="audit-description">
                          {log.description ||
                            "No description"}
                        </span>
                      </td>

                      <td>
                        <span className="audit-time">
                          {formatDate(
                            createdAt
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
