import { useEffect, useState } from "react";
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
  Search,
  Bell,
  ChevronDown,
  ArrowUpRight,
  Clock3,
  CircleCheck,
  CircleAlert,
  Workflow,
  Upload,
  Plus,
} from "lucide-react";

import appaLogo from "./assets/appa-logo.png";
import { getDashboardData,
  getOperationsSummary
} from "./api";
import Documents from "./components/Documents";
import EnterpriseModule from "./components/EnterpriseModule";
import AuditLogs from "./components/AuditLogs";
import LiveDashboard from "./components/LiveDashboard";
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

  const [operationsSummary, setOperationsSummary] =
    useState({
      pendingApprovals: 0,
      openExceptions: 0,
      exceptionInvoices: 0,
      automationStatus: "Idle",
    });

  const navigation = baseNavigation.map((item) => {
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
  });

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
    refreshOperationsSummary();

    const timer = window.setInterval(
      refreshOperationsSummary,
      15000
    );

    return () =>
      window.clearInterval(timer);
  }, []);


  const [active, setActive] = useState("Dashboard");

  const [dashboard, setDashboard] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  useEffect(() => {
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
  }, [active]);

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

          <div className="profile">
            <div className="profile-avatar">VA</div>

            <div className="profile-copy">
              <strong>Vivin A T</strong>
              <small>Administrator</small>
            </div>

            <ChevronDown size={15} />
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
              Automation online
            </div>

            <button className="icon-button">
              <Bell size={19} />
              <span className="notification-dot" />
            </button>

            <button className="user-button">
              <span>VA</span>
              <ChevronDown size={14} />
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

          {active === "Documents" ? (
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
          ) : [
            "Invoices",
            "Purchase Orders",
            "Approvals",
            "Automation",
            "Exceptions",
            "Reports",
            "Settings",
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
