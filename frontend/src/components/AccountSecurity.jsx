import {
  useState,
} from "react";

import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import {
  changePassword,
} from "../api";

function validPassword(value) {
  return (
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

function SecureInput({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}) {
  return (
    <label className="security-field">
      <span>{label}</span>

      <div className="security-input-wrap">
        <LockKeyhole size={16} />

        <input
          type={
            visible
              ? "text"
              : "password"
          }
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
        />

        <button
          type="button"
          onClick={onToggle}
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

export default function AccountSecurity({
  user,
}) {
  const [
    currentPassword,
    setCurrentPassword,
  ] = useState("");

  const [
    newPassword,
    setNewPassword,
  ] = useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState("");

  const [
    currentVisible,
    setCurrentVisible,
  ] = useState(false);

  const [
    newVisible,
    setNewVisible,
  ] = useState(false);

  const [
    confirmVisible,
    setConfirmVisible,
  ] = useState(false);

  const [working, setWorking] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const requirements = [
    {
      label: "12+ characters",
      valid:
        newPassword.length >= 12,
    },
    {
      label: "Uppercase letter",
      valid:
        /[A-Z]/.test(newPassword),
    },
    {
      label: "Lowercase letter",
      valid:
        /[a-z]/.test(newPassword),
    },
    {
      label: "Number",
      valid:
        /\d/.test(newPassword),
    },
  ];

  async function submit(event) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (
      !currentPassword ||
      !newPassword ||
      !confirmPassword
    ) {
      setError(
        "Complete all password fields."
      );
      return;
    }

    if (!validPassword(newPassword)) {
      setError(
        "Your new password does not meet the security requirements."
      );
      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setError(
        "New passwords do not match."
      );
      return;
    }

    if (
      currentPassword ===
      newPassword
    ) {
      setError(
        "Your new password must be different from your current password."
      );
      return;
    }

    try {
      setWorking(true);

      const result =
        await changePassword(
          currentPassword,
          newPassword
        );

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      setMessage(
        result?.message ||
          "Password changed successfully."
      );
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Unable to change password."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="account-security">
      <div className="account-security-heading">
        <div className="account-security-icon">
          <ShieldCheck size={21} />
        </div>

        <div>
          <span>
            ACCOUNT SECURITY
          </span>

          <h3>
            Change your password
          </h3>

          <p>
            Update the password for{" "}
            <strong>
              {user?.email}
            </strong>
            .
          </p>
        </div>
      </div>

      {error && (
        <div className="security-feedback error">
          {error}
        </div>
      )}

      {message && (
        <div className="security-feedback success">
          <Check size={16} />
          {message}
        </div>
      )}

      <form
        className="security-form"
        onSubmit={submit}
      >
        <SecureInput
          label="Current password"
          value={currentPassword}
          onChange={(event) =>
            setCurrentPassword(
              event.target.value
            )
          }
          visible={currentVisible}
          onToggle={() =>
            setCurrentVisible(
              (value) => !value
            )
          }
          autoComplete="current-password"
        />

        <div className="security-password-grid">
          <SecureInput
            label="New password"
            value={newPassword}
            onChange={(event) =>
              setNewPassword(
                event.target.value
              )
            }
            visible={newVisible}
            onToggle={() =>
              setNewVisible(
                (value) => !value
              )
            }
            autoComplete="new-password"
          />

          <SecureInput
            label="Confirm new password"
            value={confirmPassword}
            onChange={(event) =>
              setConfirmPassword(
                event.target.value
              )
            }
            visible={confirmVisible}
            onToggle={() =>
              setConfirmVisible(
                (value) => !value
              )
            }
            autoComplete="new-password"
          />
        </div>

        <div className="security-requirements">
          {requirements.map(
            (requirement) => (
              <span
                key={
                  requirement.label
                }
                className={
                  requirement.valid
                    ? "valid"
                    : ""
                }
              >
                <Check size={12} />
                {
                  requirement.label
                }
              </span>
            )
          )}
        </div>

        <div className="security-footer">
          <div>
            <KeyRound size={16} />

            <span>
              APPA stores password hashes,
              not readable passwords.
            </span>
          </div>

          <button
            type="submit"
            className="enterprise-primary-button"
            disabled={working}
          >
            <KeyRound size={16} />
            {working
              ? "Updating..."
              : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
