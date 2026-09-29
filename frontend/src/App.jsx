import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  LayoutDashboard,
  FileText,
  ReceiptText,
  ShoppingCart,
  CheckCircle2,
  Bot,
  TriangleAlert,
  ScrollText,
  BarChart3,
  Settings,
  Users,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  ArrowUpRight,
  Clock3,
  CircleCheck,
  CircleAlert,
  Workflow,
  Upload,
  Plus,
} from "lucide-react";

import appaLogo from "./assets/appa-logo.png";
import {
  getCurrentUser,
  getDashboardData,
  getOperationsSummary,
  getStoredAuthToken,
  loginUser,
  logoutUser,
  setStoredAuthToken,
} from "./api";
import Documents from "./components/Documents";
import EnterpriseModule from "./components/EnterpriseModule";
import AuditLogs from "./components/AuditLogs";
import LiveDashboard from "./components/LiveDashboard";
import Login from "./components/Login";
import UserManagement from "./components/UserManagement";
import AccountSecurity from "./components/AccountSecurity";
import "./App.css";

const baseNavigation = [
  { name: "Dashboard", icon: LayoutDashboard },
  { name: "Documents", icon: FileText },
  { name: "Invoices", icon: ReceiptText },
  { name: "Purchase Orders", icon: ShoppingCart },
  { name: "Suppliers", icon: Building2 },
  { name: "Approvals", icon: CheckCircle2 },
  { name: "Automation", icon: Bot },
  { name: "Exceptions", icon: TriangleAlert },
  { name: "Audit Logs", icon: ScrollText },
  { name: "Reports", icon: BarChart3 },
];



function Status({ value }) {
  const className = value.toLowerCase().replace(" ", "-");

  return (
    <span className={`status status-${className}`}>
      <span className="status-dot" />
      {value}
    </span>
  );
}

function App() {
  const [authUser, setAuthUser] =
    useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [loginLoading, setLoginLoading] =
    useState(false);

  const [authError, setAuthError] =
    useState("");

  const userInitials = useMemo(() => {
    const name = String(
      authUser?.fullName || ""
    ).trim();

    if (!name) return "AP";

    const parts = name
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length === 1) {
      return parts[0]
        .slice(0, 2)
        .toUpperCase();
    }

    return (
      parts[0][0] +
      parts[parts.length - 1][0]
    ).toUpperCase();
  }, [authUser]);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const token =
        getStoredAuthToken();

      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const user =
          await getCurrentUser();

        if (!cancelled) {
          setAuthUser(user);
        }
      } catch {
        setStoredAuthToken(null);

        if (!cancelled) {
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    restoreSession();

    function sessionExpired() {
      setStoredAuthToken(null);
      setAuthUser(null);
      setAuthError(
        "Your session expired. Please sign in again."
      );
    }

    window.addEventListener(
      "appa-auth-expired",
      sessionExpired
    );

    return () => {
      cancelled = true;

      window.removeEventListener(
        "appa-auth-expired",
        sessionExpired
      );
    };
  }, []);

  async function handleLogin({
    email,
    password,
  }) {
    try {
      setLoginLoading(true);
      setAuthError("");

      const result = await loginUser(
        email,
        password
      );

      setStoredAuthToken(result.token);
      setAuthUser(result.user);
    } catch (error) {
      setStoredAuthToken(null);

      setAuthError(
        error?.response?.data?.message ||
          "Unable to sign in."
      );
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutUser();
    } catch {
      // A failed logout request must still clear
      // the local authenticated session.
    } finally {
      setStoredAuthToken(null);
      setAuthUser(null);
      setAuthError("");
    }
  }

  const [operationsSummary, setOperationsSummary] =
    useState({
      pendingApprovals: 0,
      openExceptions: 0,
      exceptionInvoices: 0,
      automationStatus: "Idle",
    });

  const navigation = baseNavigation
    .map((item) => {
      if (item.name === "Approvals") {
        return {
          ...item,
          count: operationsSummary.pendingApprovals,
        };
      }

      if (item.name === "Exceptions") {
        return {
          ...item,
          count: operationsSummary.openExceptions,
        };
      }

      return item;
    })
    .concat(
      authUser?.role === "Administrator"
        ? [
            {
              name: "Users",
              icon: Users,
            },
          ]
        : []
    );

  async function refreshOperationsSummary() {
    try {
      const summary =
        await getOperationsSummary();

      setOperationsSummary(summary);
    } catch (error) {
      console.error(
        "Could not refresh AP operations summary:",
        error
      );
    }
  }

  useEffect(() => {
    if (!authUser) return undefined;

    refreshOperationsSummary();

    const timer = window.setInterval(
      refreshOperationsSummary,
      15000
    );

    return () =>
      window.clearInterval(timer);
  }, [authUser]);


  const [active, setActive] = useState("Dashboard");

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  useEffect(() => {
    if (!authUser) return undefined;

    let cancelled = false;

    async function loadDashboard() {
      setDashboardLoading(true);
      setDashboardError("");

      try {
        const data = await getDashboardData();

        if (!cancelled) {
          setDashboard(data);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardError(
            error?.response?.data?.message ||
              error?.message ||
              "Unable to load dashboard."
          );
        }
      } finally {
        if (!cancelled) {
          setDashboardLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [active, authUser]);

  if (authLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-mark">
          <img
            src={appaLogo}
            alt="APPA Finance"
          />
        </div>

        <strong>
          Securing APPA Finance
        </strong>

        <span>
          Verifying your session...
        </span>
      </div>
    );
  }

  if (!authUser) {
    return (
      <Login
        onLogin={handleLogin}
        loading={loginLoading}
        error={authError}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <img src={appaLogo} alt="APPA Finance" />
          </div>

          <div>
            <div className="brand-name">APPA</div>
            <div className="brand-subtitle">Finance Automation</div>
          </div>
        </div>

        <div className="workspace">
          <span className="workspace-label">WORKSPACE</span>

          <button className="workspace-select">
            <span className="workspace-avatar">AF</span>

            <span className="workspace-copy">
              <strong>APPA Finance</strong>
              <small>Production workspace</small>
            </span>

            <ChevronDown size={15} />
          </button>
        </div>

        <nav className="navigation">
          <span className="nav-label">OPERATIONS</span>

          {navigation.slice(0, 7).map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`nav-item ${
                  active === item.name ? "nav-item-active" : ""
                }`}
                onClick={() => setActive(item.name)}
              >
                <Icon size={18} strokeWidth={1.8} />

                <span>{item.name}</span>

                {item.count && (
                  <span className="nav-count">{item.count}</span>
                )}
              </button>
            );
          })}

          <span className="nav-label nav-label-second">INSIGHTS</span>

          {navigation.slice(7).map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`nav-item ${
                  active === item.name ? "nav-item-active" : ""
                }`}
                onClick={() => setActive(item.name)}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <button
            className={`nav-item ${
              active === "Settings" ? "nav-item-active" : ""
            }`}
            onClick={() => setActive("Settings")}
          >
            <Settings size={18} strokeWidth={1.8} />
            <span>Settings</span>
          </button>

          <div className="profile auth-profile">
            <div className="profile-avatar">
              {userInitials}
            </div>

            <div className="profile-copy">
              <strong>
                {authUser.fullName}
              </strong>

              <small>
                {authUser.role}
              </small>
            </div>

            <button
              type="button"
              className="profile-logout"
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="search">
            <Search size={18} />

            <input
              type="text"
              placeholder="Search invoices, suppliers, documents..."
            />

            <span className="shortcut">⌘ K</span>
          </div>

          <div className="top-actions">
            <div className="environment">
              <span className="environment-dot" />
              APPA engine ready
            </div>

            <button className="icon-button">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>


          </div>
        </header>

        <section className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">FINANCE OPERATIONS</p>
              <h1>{active}</h1>

              <p className="page-description">
                Monitor documents, approvals and automated finance workflows.
              </p>
            </div>

            <div className="heading-actions">
              <button className="secondary-button">
                <Upload size={17} />
                Upload document
              </button>

              <button className="primary-button">
                <Plus size={17} />
                New invoice
              </button>
            </div>
          </div>

          {active === "Users" ? (
            <UserManagement
              currentUser={authUser}
            />
          ) : active === "Documents" ? (
            <Documents />
          ) : active === "Dashboard" ? (
            <LiveDashboard
              dashboard={dashboard}
              loading={dashboardLoading}
              error={dashboardError}
              onNavigate={setActive}
            />
          ) : active === "Audit Logs" ? (
            <AuditLogs />
          ) : active === "Settings" ? (
            <div className="settings-security-stack">
              <EnterpriseModule module="Settings" />
              <AccountSecurity user={authUser} />
            </div>
          ) : [
            "Invoices",
            "Purchase Orders",
            "Suppliers",
            "Approvals",
            "Automation",
            "Exceptions",
            "Reports",
          ].includes(active) ? (
            <EnterpriseModule module={active} />
          ) : (
            <section className="empty-module">
              <div className="empty-icon">
                {(() => {
                  const item = [...navigation, {
                    name: "Settings",
                    icon: Settings,
                  }].find((entry) => entry.name === active);

                  const Icon = item?.icon || LayoutDashboard;

                  return <Icon size={28} />;
                })()}
              </div>

              <h2>{active}</h2>

              <p>
                This module is ready for implementation in the next development
                phase.
              </p>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
