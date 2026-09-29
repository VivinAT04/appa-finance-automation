import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  useState,
} from "react";

import appaLogo from "../assets/appa-logo.png";

export default function Login({
  onLogin,
  loading,
  error,
}) {
  const [email, setEmail] =
    useState("vivin@appa.local");

  const [password, setPassword] =
    useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  async function submit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      return;
    }

    await onLogin({
      email: email.trim(),
      password,
    });
  }

  return (
    <div className="auth-shell">
      <section className="auth-visual">
        <div className="auth-visual-inner">
          <div className="auth-brand">
            <div className="auth-brand-logo">
              <img
                src={appaLogo}
                alt="APPA Finance"
              />
            </div>

            <div>
              <strong>APPA</strong>
              <span>
                Finance Automation
              </span>
            </div>
          </div>

          <div className="auth-hero-copy">
            <span className="auth-eyebrow">
              SECURE FINANCE OPERATIONS
            </span>

            <h1>
              Intelligent accounts payable,
              controlled access.
            </h1>

            <p>
              Sign in to review invoices,
              approvals, exceptions,
              automation activity and
              operational reporting.
            </p>
          </div>

          <div className="auth-assurance-grid">
            <article>
              <ShieldCheck size={18} />

              <div>
                <strong>
                  Protected workspace
                </strong>

                <span>
                  Finance APIs require
                  authenticated access.
                </span>
              </div>
            </article>

            <article>
              <LockKeyhole size={18} />

              <div>
                <strong>
                  Auditable sessions
                </strong>

                <span>
                  Sign-in activity is
                  recorded for traceability.
                </span>
              </div>
            </article>
          </div>

          <div className="auth-visual-footer">
            APPA Finance Automation Platform
          </div>
        </div>
      </section>

      <section className="auth-form-side">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <img
              src={appaLogo}
              alt="APPA Finance"
            />

            <div>
              <strong>APPA</strong>
              <span>Finance Automation</span>
            </div>
          </div>

          <div className="auth-heading">
            <span>
              AUTHENTICATED ACCESS
            </span>

            <h2>Welcome back</h2>

            <p>
              Sign in to continue to the APPA
              Finance operations workspace.
            </p>
          </div>

          <form
            className="auth-form"
            onSubmit={submit}
          >
            <label>
              <span>Email address</span>

              <div className="auth-field">
                <Mail size={17} />

                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  placeholder="name@company.com"
                  disabled={loading}
                />
              </div>
            </label>

            <label>
              <span>Password</span>

              <div className="auth-field">
                <LockKeyhole size={17} />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  placeholder="Enter your password"
                  disabled={loading}
                />

                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() =>
                    setShowPassword(
                      (value) => !value
                    )
                  }
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={16} />
                  ) : (
                    <Eye size={16} />
                  )}
                </button>
              </div>
            </label>

            {error && (
              <div
                className="auth-error"
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              className="auth-submit"
              disabled={
                loading ||
                !email.trim() ||
                !password
              }
            >
              {loading
                ? "Signing in..."
                : "Sign in securely"}
            </button>
          </form>

          <div className="auth-card-footer">
            <ShieldCheck size={14} />

            <span>
              Restricted to authorised APPA
              Finance users.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
