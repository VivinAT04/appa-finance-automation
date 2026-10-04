import {
  Check,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import "./ReportingOperations.css";

const metadata = {
  amount_tolerance: {
    title: "Amount tolerance",
    unit: "GBP",
    type: "number",
    min: 0,
    step: 0.01,
    help:
      "Maximum permitted monetary variance during invoice-to-PO comparison.",
  },

  auto_approval_match_score: {
    title: "Automatic approval score",
    unit: "%",
    type: "number",
    min: 0,
    max: 100,
    step: 1,
    help:
      "Minimum successful match score required by the automatic approval policy.",
  },

  duplicate_detection: {
    title: "Duplicate detection",
    type: "boolean",
    help:
      "Checks invoice number, supplier and total value for duplicate invoice submissions.",
  },
};

function readableKey(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) =>
      character.toUpperCase()
    );
}

function formatDate(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(date);
}

function isTrue(value) {
  return String(value).toLowerCase() === "true";
}

export default function SettingsOperations({
  rows = [],
  loading = false,
  working,
  onRefresh,
  onSave,
}) {
  const [drafts, setDrafts] =
    useState({});

  const [message, setMessage] =
    useState(null);

  useEffect(() => {
    const next = {};

    for (const row of rows) {
      next[row.key] =
        String(row.value ?? "");
    }

    setDrafts(next);
  }, [rows]);

  const configured =
    useMemo(
      () => rows.length,
      [rows]
    );

  function updateDraft(key, value) {
    setDrafts((current) => ({
      ...current,
      [key]: value,
    }));

    setMessage(null);
  }

  function resetSetting(row) {
    setDrafts((current) => ({
      ...current,
      [row.key]:
        String(row.value ?? ""),
    }));

    setMessage(null);
  }

  async function saveSetting(row) {
    const value =
      String(
        drafts[row.key] ?? ""
      ).trim();

    if (!value) {
      setMessage({
        type: "error",
        text: "A setting value is required.",
      });

      return;
    }

    const config =
      metadata[row.key];

    if (
      config?.type === "number"
    ) {
      const numeric =
        Number(value);

      if (
        !Number.isFinite(numeric) ||
        (config.min != null &&
          numeric < config.min) ||
        (config.max != null &&
          numeric > config.max)
      ) {
        setMessage({
          type: "error",
          text:
            `${config.title} contains an invalid value.`,
        });

        return;
      }
    }

    try {
      await onSave(
        row.key,
        value
      );

      setMessage({
        type: "success",
        text:
          `${config?.title || readableKey(row.key)} updated successfully.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error?.response?.data?.message ||
          error?.message ||
          "Could not update setting.",
      });
    }
  }

  return (
    <section className="panel settings-panel reporting-enter">
      <header className="reporting-header">
        <div>
          <span className="reporting-eyebrow">
            Workflow configuration
          </span>

          <h2>Settings</h2>

          <p>
            Govern matching tolerance, automatic approval
            policy and duplicate detection used by APPA's
            accounts-payable workflow.
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

      {message && (
        <div
          className={`settings-message settings-message-${message.type}`}
        >
          {message.type === "success" ? (
            <Check size={15} />
          ) : (
            <X size={15} />
          )}

          {message.text}
        </div>
      )}

      <div className="settings-overview">
        <article>
          <div className="settings-overview-icon">
            <SlidersHorizontal size={18} />
          </div>

          <div>
            <span>Workflow controls</span>
            <strong>{configured}</strong>
            <small>
              Active configuration records
            </small>
          </div>
        </article>

        <article>
          <div className="settings-overview-icon">
            <ShieldCheck size={18} />
          </div>

          <div>
            <span>Configuration source</span>
            <strong>Database</strong>
            <small>
              Persisted and audit logged
            </small>
          </div>
        </article>
      </div>

      {!rows.length ? (
        <div className="settings-empty">
          <Settings2 size={25} />
          <strong>
            No workflow settings available
          </strong>
          <p>
            Initialize the APPA workflow configuration
            before changing matching controls.
          </p>
        </div>
      ) : (
        <div className="settings-grid">
          {rows.map((row) => {
            const config =
              metadata[row.key] || {
                title:
                  readableKey(row.key),
                type: "text",
                help:
                  row.description ||
                  "Workflow configuration value.",
              };

            const draft =
              drafts[row.key] ??
              String(row.value ?? "");

            const changed =
              draft !==
              String(row.value ?? "");

            const saving =
              working === row.key;

            return (
              <article
                className="settings-card"
                key={row.key}
              >
                <div className="settings-card-heading">
                  <div className="settings-card-icon">
                    <Settings2 size={17} />
                  </div>

                  <div>
                    <span>
                      {row.key}
                    </span>

                    <h3>
                      {config.title}
                    </h3>
                  </div>
                </div>

                <p className="settings-description">
                  {row.description ||
                    config.help}
                </p>

                <div className="settings-control">
                  {config.type ===
                  "boolean" ? (
                    <button
                      type="button"
                      className={`settings-toggle ${
                        isTrue(draft)
                          ? "settings-toggle-on"
                          : ""
                      }`}
                      onClick={() =>
                        updateDraft(
                          row.key,
                          isTrue(draft)
                            ? "false"
                            : "true"
                        )
                      }
                    >
                      <span
                        className="settings-toggle-track"
                      >
                        <span />
                      </span>

                      <strong>
                        {isTrue(draft)
                          ? "Enabled"
                          : "Disabled"}
                      </strong>
                    </button>
                  ) : (
                    <div className="settings-input-wrap">
                      <input
                        type={config.type}
                        min={config.min}
                        max={config.max}
                        step={config.step}
                        value={draft}
                        onChange={(event) =>
                          updateDraft(
                            row.key,
                            event.target.value
                          )
                        }
                      />

                      {config.unit && (
                        <span>
                          {config.unit}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="settings-meta">
                  <span>
                    Current:{" "}
                    <strong>
                      {String(
                        row.value
                      )}
                    </strong>
                  </span>

                  <span>
                    Updated:{" "}
                    <strong>
                      {formatDate(
                        row.updatedAt
                      )}
                    </strong>
                  </span>
                </div>

                <div className="settings-actions">
                  <button
                    type="button"
                    className="settings-secondary"
                    disabled={
                      !changed || saving
                    }
                    onClick={() =>
                      resetSetting(row)
                    }
                  >
                    Reset
                  </button>

                  <button
                    type="button"
                    className="settings-primary"
                    disabled={
                      !changed || saving
                    }
                    onClick={() =>
                      saveSetting(row)
                    }
                  >
                    <Save size={14} />

                    {saving
                      ? "Saving..."
                      : "Save change"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="settings-governance">
        <ShieldCheck size={17} />

        <div>
          <strong>
            Configuration governance
          </strong>

          <p>
            Changes are persisted through the APPA
            settings API and recorded in the audit log.
            These controls affect workflow behaviour and
            should be changed deliberately.
          </p>
        </div>
      </div>
    </section>
  );
}
