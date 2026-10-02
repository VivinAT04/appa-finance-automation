import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";

import {
  getInvoices,
  getPurchaseOrders,
  getSuppliers,
  getApprovals,
  getPendingApprovals,
  getExceptions,
  getAutomationRuns,
  getReports,
  getSettings,
  matchInvoiceToPO,
  submitApproval,
  resolveException,
  updateSetting,
} from "../api";

import InvoiceOperations from "./InvoiceOperations";
import PurchaseOrderOperations from "./PurchaseOrderOperations";
import SupplierOperations from "./SupplierOperations";
import ApprovalOperations from "./ApprovalOperations";
import ExceptionWorkbench from "./ExceptionWorkbench";
import AutomationOperations from "./AutomationOperations";
import ReportingOperations from "./ReportingOperations";
import SettingsOperations from "./SettingsOperations";

import "./EnterpriseModule.css";






export default function EnterpriseModule({ module }) {
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      switch (module) {
        case "Invoices":
          setRows(await getInvoices());
          break;

        case "Purchase Orders":
          setRows(await getPurchaseOrders());
          break;

        case "Suppliers":
          setRows(await getSuppliers());
          break;

        case "Approvals": {
          const [
            pendingApprovals,
            approvalHistory,
          ] = await Promise.all([
            getPendingApprovals(),
            getApprovals(),
          ]);

          setRows({
            pending: pendingApprovals,
            history: approvalHistory,
          });
          break;
        }

        case "Exceptions":
          setRows(await getExceptions());
          break;

        case "Automation":
          setRows(await getAutomationRuns());
          break;

        case "Reports":
          setReport(await getReports());
          break;

        case "Settings":
          setRows(await getSettings());
          break;

        default:
          setRows([]);
      }
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          requestError?.message ||
          "Unable to load module."
      );
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    load();
  }, [load]);

  async function match(invoiceId) {
    try {
      setWorking(invoiceId);
      setMessage("");
      setError("");

      const result = await matchInvoiceToPO(invoiceId);

      setMessage(
        `Matching completed: ${result.matchStatus} (${result.matchScore}%).`
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Invoice matching failed."
      );
    } finally {
      setWorking("");
    }
  }

  async function manualDecision(
    invoiceId,
    decision,
    comments = ""
  ) {
    try {
      setWorking(invoiceId);
      setMessage("");
      setError("");

      await submitApproval(
        invoiceId,
        decision,
        comments
      );

      setMessage(
        `Invoice ${decision.toLowerCase()} successfully.`
      );

      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Approval action failed."
      );
    } finally {
      setWorking("");
    }
  }

  async function resolve(
    id,
    resolution
  ) {
    if (!resolution?.trim()) return;

    try {
      setWorking(id);
      setMessage("");
      setError("");

      await resolveException(
        id,
        resolution.trim()
      );

      setMessage("Exception resolved.");
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Could not resolve exception."
      );
    } finally {
      setWorking("");
    }
  }


  async function editSetting(setting) {
    const value =
      setting?.directValue ??
      setting?.value;

    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      throw new Error(
        "Setting value is required."
      );
    }

    setWorking(setting.key);

    try {
      await updateSetting(
        setting.key,
        String(value)
      );

      await load();
    } finally {
      setWorking("");
    }
  }

  if (loading) {
    return (
      <section className="panel enterprise-panel">
        <div className="enterprise-loading">
          <RefreshCw size={19} className="enterprise-spin" />
          Loading {module}...
        </div>
      </section>
    );
  }

  return (
    <div className="enterprise-module">
      {error && (
        <div className="enterprise-alert enterprise-alert-error">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div className="enterprise-alert enterprise-alert-success">
          <CheckCircle2 size={17} />
          <span>{message}</span>
        </div>
      )}

      {module === "Invoices" && (
        <InvoiceOperations
          rows={rows}
          working={working}
          onRefresh={load}
          onMatch={match}
        />
      )}

      {module === "Purchase Orders" && (
        <PurchaseOrderOperations
          rows={rows}
          onRefresh={load}
        />
      )}

      {module === "Suppliers" && (
        <SupplierOperations
          rows={rows}
          onRefresh={load}
        />
      )}



      {module === "Approvals" && (
        <ApprovalOperations
          pending={rows?.pending || []}
          history={rows?.history || []}
          working={working}
          onRefresh={load}
          onDecision={manualDecision}
        />
      )}

      {module === "Exceptions" && (
        <ExceptionWorkbench
          rows={rows}
          working={working}
          onRefresh={load}
          onResolve={resolve}
        />
      )}

      {module === "Automation" && (
        <AutomationOperations />
      )}

      {module === "Reports" && (
        <ReportsView
          report={report}
          onRefresh={load}
        />
      )}

      {module === "Settings" && (
        <SettingsView
          rows={rows}
          working={working}
          onRefresh={load}
          onEdit={editSetting}
        />
      )}
    </div>
  );
}


function ReportsView({
  report,
  onRefresh,
}) {
  return (
    <ReportingOperations
      report={report}
      onRefresh={onRefresh}
    />
  );
}

function SettingsView({
  rows,
  working,
  onRefresh,
  onEdit,
}) {
  async function saveSetting(
    key,
    value
  ) {
    const row = rows.find(
      (item) => item.key === key
    );

    if (!row) {
      throw new Error(
        "Setting not found."
      );
    }

    await onEdit({
      ...row,
      value,
      directValue: value,
    });
  }

  return (
    <SettingsOperations
      rows={rows}
      working={working}
      onRefresh={onRefresh}
      onSave={saveSetting}
    />
  );
}
