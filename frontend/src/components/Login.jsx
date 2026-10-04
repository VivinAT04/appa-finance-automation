import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import {
  useState,
} from "react";

import appaLogo from "../assets/appa-logo.png";

import {
  requestPasswordReset,
  resetPassword,
} from "../api";

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
}) {
  const [visible, setVisible] =
    useState(false);

  return (
    <label>
      <span>{label}</span>

      <div className="auth-field">
        <LockKeyhole size={17} />

        <input
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder={placeholder}
          disabled={disabled}
        />

        <button
          type="button"
          className="auth-password-toggle"
          onClick={() =>
            setVisible((current) => !current)
          }
          aria-label={
            visible
              ? "Hide password"
              : "Show password"
          }
        >
          {visible ? (
            <EyeOff size={16} />
          ) : (
            <Eye size={16} />
          )}
        </button>
      </div>
    </label>
  );
}

export default function Login({
  onLogin,
  loading,
  error,
}) {
  const [view, setView] =
    useState("login");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [demoLoading, setDemoLoading] =
    useState(false);

  const [resetToken, setResetToken] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [recoveryLoading, setRecoveryLoading] =
    useState(false);

  const [recoveryError, setRecoveryError] =
    useState("");

  const [recoveryMessage, setRecoveryMessage] =
    useState("");

  const [developmentToken, setDevelopmentToken] =
    useState("");

  function clearRecoveryState() {
    setRecoveryError("");
    setRecoveryMessage("");
  }

  function goToLogin() {
    clearRecoveryState();
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setResetToken("");
    setDevelopmentToken("");
    setView("login");
  }

  async function submitLogin(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      return;
    }

    await onLogin({
      email: email.trim(),
      password,
    });
  }

  async function openDemo() {
    try {
      setDemoLoading(true);

      await onLogin({
        email: "test@gmail.com",
        password: "Testappa0812",
      });
    } finally {
      setDemoLoading(false);
    }
  }

  async function submitForgot(event) {
    event.preventDefault();

    if (!email.trim()) {
      return;
    }

    try {
      setRecoveryLoading(true);
      clearRecoveryState();

      const result =
        await requestPasswordReset(
          email.trim()
        );

      setRecoveryMessage(result.message);

      if (result.developmentResetToken) {
        setDevelopmentToken(
          result.developmentResetToken
        );

        setResetToken(
          result.developmentResetToken
        );
      }

      setView("reset");
    } catch (requestError) {
      setRecoveryError(
        requestError?.response?.data?.message ||
          "Unable to start password recovery."
      );
    } finally {
      setRecoveryLoading(false);
    }
  }

  async function submitReset(event) {
    event.preventDefault();

    clearRecoveryState();

    if (!resetToken.trim()) {
      setRecoveryError(
        "A reset token is required."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setRecoveryError(
        "The passwords do not match."
      );
      return;
    }

    try {
      setRecoveryLoading(true);

      const result =
        await resetPassword(
          resetToken.trim(),
          newPassword
        );

      setRecoveryMessage(result.message);
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setResetToken("");
      setDevelopmentToken("");
      setView("complete");
    } catch (requestError) {
      setRecoveryError(
        requestError?.response?.data?.message ||
          "Unable to reset the password."
      );
    } finally {
      setRecoveryLoading(false);
    }
  }

  function renderLogin() {
    return (
      <>
        <div className="auth-heading">
          <span>AUTHENTICATED ACCESS</span>
          <h2>Welcome back</h2>
          <p>
            Sign in to continue to the APPA
            Finance operations workspace.
          </p>
        </div>

        <form
          className="auth-form"
          onSubmit={submitLogin}
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
                  setEmail(event.target.value)
                }
                placeholder="name@company.com"
                disabled={loading}
              />
            </div>
          </label>

          <div className="auth-password-header">
            <span>Password</span>

            <button
              type="button"
              onClick={() => {
                clearRecoveryState();
                setView("forgot");
              }}
            >
              Forgot password?
            </button>
          </div>

          <PasswordField
            label=""
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={loading}
          />

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

          <div
            style={{
              marginTop: "18px",
              paddingTop: "18px",
              borderTop: "1px solid rgba(148, 163, 184, 0.22)",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: "0 0 5px",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Want to explore APPA?
            </p>

            <p
              style={{
                margin: "0 0 12px",
                fontSize: "12px",
                lineHeight: 1.5,
                opacity: 0.68,
              }}
            >
              Open the demonstration finance automation workspace.
            </p>

            <button
              type="button"
              className="auth-submit"
              style={{ width: "100%" }}
              onClick={openDemo}
              disabled={loading || demoLoading}
            >
              {demoLoading
                ? "Opening demo..."
                : "View Demo →"}
            </button>
          </div>
      </>
    );
  }

  function renderForgot() {
    return (
      <>
        <button
          type="button"
          className="auth-back"
          onClick={goToLogin}
        >
          <ArrowLeft size={14} />
          Back to sign in
        </button>

        <div className="auth-recovery-icon">
          <KeyRound size={20} />
        </div>

        <div className="auth-heading">
          <span>ACCOUNT RECOVERY</span>
          <h2>Forgot password?</h2>
          <p>
            Enter your APPA Finance email.
            We'll create a secure,
            time-limited password reset.
          </p>
        </div>

        <form
          className="auth-form"
          onSubmit={submitForgot}
        >
          <label>
            <span>Email address</span>

            <div className="auth-field">
              <Mail size={17} />

              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                placeholder="name@company.com"
                disabled={recoveryLoading}
              />
            </div>
          </label>

          {recoveryError && (
            <div
              className="auth-error"
              role="alert"
            >
              {recoveryError}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={
              recoveryLoading ||
              !email.trim()
            }
          >
            {recoveryLoading
              ? "Creating reset..."
              : "Continue securely"}
          </button>
        </form>
      </>
    );
  }

  function renderReset() {
    return (
      <>
        <button
          type="button"
          className="auth-back"
          onClick={() => {
            clearRecoveryState();
            setView("forgot");
          }}
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <div className="auth-recovery-icon">
          <LockKeyhole size={20} />
        </div>

        <div className="auth-heading">
          <span>SECURE RESET</span>
          <h2>Create new password</h2>
          <p>
            Reset links expire after 15
            minutes and can only be used once.
          </p>
        </div>

        {recoveryMessage && (
          <div className="auth-info">
            {recoveryMessage}
          </div>
        )}

        {developmentToken && (
          <div className="auth-dev-note">
            <strong>
              Local development mode
            </strong>
            <span>
              No email provider is connected.
              The secure development token has
              been inserted automatically.
            </span>
          </div>
        )}

        <form
          className="auth-form"
          onSubmit={submitReset}
        >
          <label>
            <span>Reset token</span>

            <div className="auth-field">
              <KeyRound size={17} />

              <input
                type="text"
                autoComplete="off"
                value={resetToken}
                onChange={(event) =>
                  setResetToken(
                    event.target.value
                  )
                }
                placeholder="Enter reset token"
                disabled={recoveryLoading}
              />
            </div>
          </label>

          <PasswordField
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Create a new password"
            autoComplete="new-password"
            disabled={recoveryLoading}
          />

          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Repeat the new password"
            autoComplete="new-password"
            disabled={recoveryLoading}
          />

          <div className="auth-password-rules">
            Minimum 12 characters with
            uppercase, lowercase and a number.
          </div>

          {recoveryError && (
            <div
              className="auth-error"
              role="alert"
            >
              {recoveryError}
            </div>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={
              recoveryLoading ||
              !resetToken.trim() ||
              !newPassword ||
              !confirmPassword
            }
          >
            {recoveryLoading
              ? "Updating password..."
              : "Reset password"}
          </button>
        </form>
      </>
    );
  }

  function renderComplete() {
    return (
      <div className="auth-complete">
        <div className="auth-success-icon">
          <CheckCircle2 size={23} />
        </div>

        <div className="auth-heading">
          <span>PASSWORD UPDATED</span>
          <h2>You're ready to sign in</h2>
          <p>
            Your password was changed
            successfully. Use your new
            password to access APPA Finance.
          </p>
        </div>

        {recoveryMessage && (
          <div className="auth-info">
            {recoveryMessage}
          </div>
        )}

        <button
          type="button"
          className="auth-submit"
          onClick={goToLogin}
        >
          Return to sign in
        </button>
      </div>
    );
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

          {view === "login" &&
            renderLogin()}

          {view === "forgot" &&
            renderForgot()}

          {view === "reset" &&
            renderReset()}

          {view === "complete" &&
            renderComplete()}

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
