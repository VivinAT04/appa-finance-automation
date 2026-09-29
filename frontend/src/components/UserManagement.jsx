import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Check,
  ChevronDown,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";

import {
  adminResetUserPassword,
  createUser,
  getUserRoles,
  getUsers,
  updateUser,
} from "../api";

const FALLBACK_ROLES = [
  "Administrator",
  "Finance Manager",
  "Finance Analyst",
  "Approver",
  "Auditor",
];

function formatDate(value) {
  if (!value) return "Never";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "AP";

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

function passwordValid(value) {
  return (
    value.length >= 12 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

function PasswordRequirements({
  value,
}) {
  const rules = [
    {
      label: "12+ characters",
      valid: value.length >= 12,
    },
    {
      label: "Uppercase",
      valid: /[A-Z]/.test(value),
    },
    {
      label: "Lowercase",
      valid: /[a-z]/.test(value),
    },
    {
      label: "Number",
      valid: /\d/.test(value),
    },
  ];

  return (
    <div className="user-password-rules">
      {rules.map((rule) => (
        <span
          key={rule.label}
          className={
            rule.valid
              ? "user-password-rule valid"
              : "user-password-rule"
          }
        >
          <Check size={12} />
          {rule.label}
        </span>
      ))}
    </div>
  );
}

function Modal({
  title,
  eyebrow,
  children,
  onClose,
}) {
  return (
    <div
      className="user-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="user-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="user-modal-header">
          <div>
            <span>{eyebrow}</span>
            <h3>{title}</h3>
          </div>

          <button
            type="button"
            className="user-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        {children}
      </section>
    </div>
  );
}

export default function UserManagement({
  currentUser,
}) {
  const [users, setUsers] =
    useState([]);

  const [roles, setRoles] =
    useState(FALLBACK_ROLES);

  const [loading, setLoading] =
    useState(true);

  const [working, setWorking] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const [createOpen, setCreateOpen] =
    useState(false);

  const [resetUser, setResetUser] =
    useState(null);

  const [newUser, setNewUser] =
    useState({
      fullName: "",
      email: "",
      role: "Finance Analyst",
      password: "",
    });

  const [
    temporaryPassword,
    setTemporaryPassword,
  ] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const [
        userRows,
        roleRows,
      ] = await Promise.all([
        getUsers(),
        getUserRoles(),
      ]);

      setUsers(userRows || []);

      const roleNames =
        (roleRows || [])
          .map((item) => item.name)
          .filter(Boolean);

      if (roleNames.length) {
        setRoles(roleNames);
      }
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Unable to load APPA users."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const metrics = useMemo(() => {
    const active = users.filter(
      (user) =>
        user.status === "Active"
    ).length;

    const administrators =
      users.filter(
        (user) =>
          user.role ===
            "Administrator" &&
          user.status === "Active"
      ).length;

    const inactive =
      users.filter(
        (user) =>
          user.status !== "Active"
      ).length;

    return {
      total: users.length,
      active,
      administrators,
      inactive,
    };
  }, [users]);

  const filteredUsers =
    useMemo(() => {
      const query =
        search.trim().toLowerCase();

      if (!query) return users;

      return users.filter((user) => {
        const haystack = [
          user.fullName,
          user.email,
          user.role,
          user.status,
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      });
    }, [users, search]);

  async function handleCreate(
    event
  ) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (
      !newUser.fullName.trim() ||
      !newUser.email.trim()
    ) {
      setError(
        "Full name and email are required."
      );
      return;
    }

    if (
      !passwordValid(
        newUser.password
      )
    ) {
      setError(
        "Temporary password does not meet the security requirements."
      );
      return;
    }

    try {
      setWorking("create");

      await createUser({
        fullName:
          newUser.fullName.trim(),
        email:
          newUser.email
            .trim()
            .toLowerCase(),
        role: newUser.role,
        password: newUser.password,
      });

      setCreateOpen(false);

      setNewUser({
        fullName: "",
        email: "",
        role: "Finance Analyst",
        password: "",
      });

      setMessage(
        "User account created successfully."
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Could not create user."
      );
    } finally {
      setWorking("");
    }
  }

  async function changeRole(
    user,
    role
  ) {
    if (role === user.role) return;

    setMessage("");
    setError("");

    try {
      setWorking(user.id);

      await updateUser(
        user.id,
        { role }
      );

      setMessage(
        `${user.fullName}'s role was updated.`
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Could not update role."
      );
    } finally {
      setWorking("");
    }
  }

  async function toggleStatus(user) {
    const nextStatus =
      user.status === "Active"
        ? "Inactive"
        : "Active";

    setMessage("");
    setError("");

    try {
      setWorking(user.id);

      await updateUser(
        user.id,
        {
          status: nextStatus,
        }
      );

      setMessage(
        `${user.fullName} is now ${nextStatus.toLowerCase()}.`
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Could not update account status."
      );
    } finally {
      setWorking("");
    }
  }

  async function handleResetPassword(
    event
  ) {
    event.preventDefault();

    if (!resetUser) return;

    setMessage("");
    setError("");

    if (
      !passwordValid(
        temporaryPassword
      )
    ) {
      setError(
        "Temporary password does not meet the security requirements."
      );
      return;
    }

    try {
      setWorking(
        `reset-${resetUser.id}`
      );

      await adminResetUserPassword(
        resetUser.id,
        temporaryPassword
      );

      setMessage(
        `Temporary password updated for ${resetUser.fullName}.`
      );

      setTemporaryPassword("");
      setResetUser(null);
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Could not reset password."
      );
    } finally {
      setWorking("");
    }
  }

  return (
    <div className="user-management">
      <section className="user-management-hero">
        <div>
          <span className="user-management-eyebrow">
            ACCESS GOVERNANCE
          </span>

          <h2>
            User administration
          </h2>

          <p>
            Manage authorised APPA Finance
            users, operational roles and
            account access.
          </p>
        </div>

        <div className="user-management-actions">
          <button
            type="button"
            className="enterprise-secondary-button"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw
              size={15}
              className={
                loading
                  ? "enterprise-spin"
                  : ""
              }
            />
            Refresh
          </button>

          <button
            type="button"
            className="enterprise-primary-button"
            onClick={() => {
              setError("");
              setMessage("");
              setCreateOpen(true);
            }}
          >
            <UserPlus size={16} />
            Create user
          </button>
        </div>
      </section>

      {error && (
        <div className="user-feedback error">
          {error}
        </div>
      )}

      {message && (
        <div className="user-feedback success">
          <ShieldCheck size={16} />
          {message}
        </div>
      )}

      <section className="user-metric-grid">
        <article className="user-metric-card">
          <div>
            <span>Total users</span>
            <strong>
              {metrics.total}
            </strong>
          </div>
          <Users size={20} />
        </article>

        <article className="user-metric-card">
          <div>
            <span>Active users</span>
            <strong>
              {metrics.active}
            </strong>
          </div>
          <UserCheck size={20} />
        </article>

        <article className="user-metric-card">
          <div>
            <span>
              Administrators
            </span>
            <strong>
              {metrics.administrators}
            </strong>
          </div>
          <ShieldCheck size={20} />
        </article>

        <article className="user-metric-card">
          <div>
            <span>
              Inactive
            </span>
            <strong>
              {metrics.inactive}
            </strong>
          </div>
          <UserX size={20} />
        </article>
      </section>

      <section className="user-directory-card">
        <div className="user-directory-header">
          <div>
            <h3>User directory</h3>
            <p>
              Access is restricted to
              authorised APPA Finance users.
            </p>
          </div>

          <label className="user-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search users..."
            />
          </label>
        </div>

        {loading ? (
          <div className="user-loading">
            <RefreshCw
              size={19}
              className="enterprise-spin"
            />
            Loading users...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="user-empty">
            <Users size={25} />
            <strong>
              No users found
            </strong>
            <span>
              Try another search.
            </span>
          </div>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Created</th>
                  <th>
                    <span className="sr-only">
                      Actions
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map(
                  (user) => {
                    const isSelf =
                      currentUser?.id ===
                      user.id;

                    return (
                      <tr key={user.id}>
                        <td>
                          <div className="user-identity">
                            <span className="user-avatar">
                              {initials(
                                user.fullName
                              )}
                            </span>

                            <div>
                              <strong>
                                {
                                  user.fullName
                                }
                              </strong>

                              <span>
                                {user.email}
                              </span>

                              {isSelf && (
                                <small>
                                  Your account
                                </small>
                              )}
                            </div>
                          </div>
                        </td>

                        <td>
                          <label className="user-select-wrap">
                            <select
                              value={
                                user.role
                              }
                              disabled={
                                working ===
                                user.id
                              }
                              onChange={(
                                event
                              ) =>
                                changeRole(
                                  user,
                                  event
                                    .target
                                    .value
                                )
                              }
                            >
                              {roles.map(
                                (role) => (
                                  <option
                                    key={
                                      role
                                    }
                                    value={
                                      role
                                    }
                                  >
                                    {role}
                                  </option>
                                )
                              )}
                            </select>

                            <ChevronDown
                              size={14}
                            />
                          </label>
                        </td>

                        <td>
                          <span
                            className={`user-status ${
                              user.status ===
                              "Active"
                                ? "active"
                                : "inactive"
                            }`}
                          >
                            <span />
                            {user.status}
                          </span>
                        </td>

                        <td className="user-muted-cell">
                          {formatDate(
                            user.lastLoginAt
                          )}
                        </td>

                        <td className="user-muted-cell">
                          {formatDate(
                            user.createdAt
                          )}
                        </td>

                        <td>
                          <div className="user-row-actions">
                            <button
                              type="button"
                              className="user-row-button"
                              title="Reset temporary password"
                              onClick={() => {
                                setError("");
                                setMessage("");
                                setTemporaryPassword(
                                  ""
                                );
                                setResetUser(
                                  user
                                );
                              }}
                            >
                              <KeyRound
                                size={15}
                              />
                            </button>

                            <button
                              type="button"
                              className={`user-row-button ${
                                user.status ===
                                "Active"
                                  ? "danger"
                                  : "positive"
                              }`}
                              disabled={
                                working ===
                                  user.id ||
                                isSelf
                              }
                              title={
                                isSelf
                                  ? "You cannot deactivate your own account"
                                  : user.status ===
                                    "Active"
                                  ? "Deactivate user"
                                  : "Activate user"
                              }
                              onClick={() =>
                                toggleStatus(
                                  user
                                )
                              }
                            >
                              {user.status ===
                              "Active" ? (
                                <UserX
                                  size={15}
                                />
                              ) : (
                                <UserCheck
                                  size={15}
                                />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="user-governance-note">
        <ShieldCheck size={18} />

        <div>
          <strong>
            Access governance
          </strong>

          <p>
            User administration is available
            only to Administrators. APPA also
            prevents removal of the final
            active Administrator.
          </p>
        </div>
      </section>

      {createOpen && (
        <Modal
          eyebrow="NEW ACCESS"
          title="Create APPA user"
          onClose={() =>
            setCreateOpen(false)
          }
        >
          <form
            className="user-form"
            onSubmit={handleCreate}
          >
            <label>
              <span>Full name</span>
              <input
                type="text"
                autoComplete="name"
                value={
                  newUser.fullName
                }
                onChange={(event) =>
                  setNewUser(
                    (current) => ({
                      ...current,
                      fullName:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="e.g. Priya Kumar"
              />
            </label>

            <label>
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={newUser.email}
                onChange={(event) =>
                  setNewUser(
                    (current) => ({
                      ...current,
                      email:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="priya@example.com"
              />
            </label>

            <label>
              <span>Role</span>
              <select
                value={newUser.role}
                onChange={(event) =>
                  setNewUser(
                    (current) => ({
                      ...current,
                      role:
                        event.target
                          .value,
                    })
                  )
                }
              >
                {roles.map(
                  (role) => (
                    <option
                      key={role}
                      value={role}
                    >
                      {role}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span>
                Temporary password
              </span>

              <input
                type="password"
                autoComplete="new-password"
                value={
                  newUser.password
                }
                onChange={(event) =>
                  setNewUser(
                    (current) => ({
                      ...current,
                      password:
                        event.target
                          .value,
                    })
                  )
                }
                placeholder="Create a temporary password"
              />
            </label>

            <PasswordRequirements
              value={newUser.password}
            />

            <div className="user-form-note">
              <KeyRound size={15} />
              <span>
                Share temporary credentials
                securely. Never send passwords
                in public channels.
              </span>
            </div>

            <div className="user-form-actions">
              <button
                type="button"
                className="enterprise-secondary-button"
                onClick={() =>
                  setCreateOpen(false)
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="enterprise-primary-button"
                disabled={
                  working === "create"
                }
              >
                <UserPlus size={16} />
                {working === "create"
                  ? "Creating..."
                  : "Create user"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetUser && (
        <Modal
          eyebrow="SECURITY ACTION"
          title="Reset temporary password"
          onClose={() =>
            setResetUser(null)
          }
        >
          <form
            className="user-form"
            onSubmit={
              handleResetPassword
            }
          >
            <div className="user-reset-person">
              <span className="user-avatar">
                {initials(
                  resetUser.fullName
                )}
              </span>

              <div>
                <strong>
                  {resetUser.fullName}
                </strong>
                <span>
                  {resetUser.email}
                </span>
              </div>
            </div>

            <label>
              <span>
                New temporary password
              </span>

              <input
                type="password"
                autoComplete="new-password"
                value={
                  temporaryPassword
                }
                onChange={(event) =>
                  setTemporaryPassword(
                    event.target.value
                  )
                }
                placeholder="Enter temporary password"
              />
            </label>

            <PasswordRequirements
              value={
                temporaryPassword
              }
            />

            <div className="user-form-actions">
              <button
                type="button"
                className="enterprise-secondary-button"
                onClick={() =>
                  setResetUser(null)
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="enterprise-primary-button"
                disabled={
                  working ===
                  `reset-${resetUser.id}`
                }
              >
                <KeyRound size={16} />
                {working ===
                `reset-${resetUser.id}`
                  ? "Updating..."
                  : "Update password"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
