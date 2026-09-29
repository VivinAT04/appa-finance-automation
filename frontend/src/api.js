import axios from "axios";

export const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ||
    "http://localhost:4000/api",
  timeout: 15000,
});

export async function getDocuments() {
  const response = await api.get("/documents");
  return response.data.documents;
}

export async function uploadDocument(file, documentType) {
  const form = new FormData();

  form.append("document", file);
  form.append("documentType", documentType);

  const response = await api.post(
    "/documents/upload",
    form
  );

  return response.data.document;
}

export function getDocumentFileUrl(id) {
  return `${api.defaults.baseURL}/documents/${id}/file`;
}


export async function getInvoices() {
  const response = await api.get("/invoices");
  return response.data.invoices;
}

export async function getInvoice(id) {
  const response = await api.get(`/invoices/${id}`);
  return response.data.invoice;
}

export async function getInvoiceForDocument(documentId) {
  const response = await api.get(
    `/invoices/document/${documentId}`
  );

  return response.data.invoice;
}

export async function processInvoice(documentId) {
  const response = await api.post(
    `/invoices/process/${documentId}`
  );

  return response.data.invoice;
}

export async function getAuditLogs() {
  const response = await api.get("/audit");
  return response.data.logs;
}


/* APPA ENTERPRISE FRONTEND API */

export async function getSuppliers() {
  const response = await api.get(
    "/enterprise/suppliers"
  );

  return response.data.suppliers;
}

export async function getPurchaseOrders() {
  const response = await api.get(
    "/enterprise/purchase-orders"
  );

  return response.data.purchaseOrders;
}

export async function getPurchaseOrder(id) {
  const response = await api.get(
    `/enterprise/purchase-orders/${id}`
  );

  return response.data.purchaseOrder;
}

export async function matchInvoiceToPO(
  invoiceId
) {
  const response = await api.post(
    `/enterprise/matching/${invoiceId}`
  );

  return response.data.match;
}

export async function getInvoiceMatch(
  invoiceId
) {
  const response = await api.get(
    `/enterprise/matching/${invoiceId}`
  );

  return response.data.match;
}

export async function getApprovals() {
  const response = await api.get(
    "/enterprise/approvals"
  );

  return response.data.approvals;
}

export async function submitApproval(
  invoiceId,
  decision,
  comments = ""
) {
  const response = await api.post(
    `/enterprise/approvals/${invoiceId}`,
    {
      decision,
      comments,
      approver: "Administrator",
    }
  );

  return response.data;
}

export async function getExceptions() {
  const response = await api.get(
    "/enterprise/exceptions"
  );

  return response.data.exceptions;
}

export async function resolveException(
  id,
  resolution
) {
  const response = await api.post(
    `/enterprise/exceptions/${id}/resolve`,
    {
      resolution,
    }
  );

  return response.data;
}

export async function getAutomationRuns() {
  const response = await api.get(
    "/enterprise/automation-runs"
  );

  return response.data.runs;
}

export async function runAPCycle(
  source = "APPA Engine"
) {
  const response = await api.post(
    "/enterprise/automation/run-ap-cycle",
    {
      source,
    }
  );

  return response.data.run;
}

export async function getDashboardData() {
  const response = await api.get(
    "/enterprise/dashboard"
  );

  return response.data.dashboard;
}

export async function getReports() {
  const response = await api.get(
    "/enterprise/reports"
  );

  return response.data;
}

export async function getSettings() {
  const response = await api.get(
    "/enterprise/settings"
  );

  return response.data.settings;
}

export async function updateSetting(
  key,
  value
) {
  const response = await api.put(
    `/enterprise/settings/${key}`,
    {
      value,
    }
  );

  return response.data;
}

export async function seedEnterpriseData() {
  const response = await api.post(
    "/enterprise/seed"
  );

  return response.data;
}

export async function getRPAWorkItems() {
  const response = await api.get(
    "/enterprise/rpa/work-items"
  );

  return response.data;
}

export async function submitRPAResult({
  invoiceId,
  robotName,
  status,
  message,
}) {
  const response = await api.post(
    "/enterprise/rpa/results",
    {
      invoiceId,
      robotName,
      status,
      message,
    }
  );

  return response.data;
}


/* APPA SYNTHETIC WORKFLOW SCENARIOS */

export async function seedWorkflowScenarios() {
  const response = await api.post(
    "/enterprise/scenarios/seed"
  );

  return response.data;
}

export async function getWorkflowScenarios() {
  const response = await api.get(
    "/enterprise/scenarios"
  );

  return response.data.scenarios;
}

export async function getWorkflowScenarioResults() {
  const response = await api.get(
    "/enterprise/scenarios/results"
  );

  return response.data;
}

export async function resetWorkflowScenarios() {
  const response = await api.delete(
    "/enterprise/scenarios"
  );

  return response.data;
}


export async function runWorkflowScenarios() {
  const response = await api.post(
    "/enterprise/scenarios/run"
  );

  return response.data;
}


/* APPA FINANCE OPERATIONS */

export async function getPendingApprovals() {
  const response = await api.get(
    "/enterprise/approvals/pending"
  );

  return response.data.pending;
}

export async function getOperationsSummary() {
  const response = await api.get(
    "/enterprise/operations-summary"
  );

  return response.data.summary;
}
