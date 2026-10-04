import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  FileDown,
  FileText,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";

import {
  createPurchaseOrder,
  getPurchaseOrder,
  getPurchaseOrders,
  getSuppliers,
  matchInvoiceToPO,
  submitBillToDocuments,
} from "../api";

import "./ProcurementOperations.css";

function money(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function uniqueNumber(prefix) {
  return `${prefix}-${crypto.randomUUID()
    .replace(/-/g, "")
    .slice(0, 10)
    .toUpperCase()}`;
}

function newLine() {
  return {
    description: "",
    quantity: 1,
    unitPrice: 0,
  };
}

function totals(items, taxRate = 18) {
  const subtotal = items.reduce(
    (sum, item) =>
      sum +
      Number(item.quantity || 0) *
        Number(item.unitPrice || 0),
    0
  );

  const taxAmount =
    subtotal * (Number(taxRate || 0) / 100);

  return {
    subtotal,
    taxAmount,
    totalAmount: subtotal + taxAmount,
  };
}

function escapePdf(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "");
}

function createPdfBlob(lines) {
  const safeLines = lines.map(escapePdf);

  let stream =
    "BT\n/F1 11 Tf\n50 790 Td\n";

  safeLines.forEach((line, index) => {
    if (index > 0) {
      stream += "0 -18 Td\n";
    }

    stream += `(${line}) Tj\n`;
  });

  stream += "ET";

  const objects = [
    "",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let i = 1; i < objects.length; i += 1) {
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xref = pdf.length;

  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let i = 1; i < objects.length; i += 1) {
    pdf +=
      String(offsets[i]).padStart(10, "0") +
      " 00000 n \n";
  }

  pdf +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF`;

  return new Blob([pdf], {
    type: "application/pdf",
  });
}

function buildBillPdf(bill, po) {
  const t = totals(
    bill.lineItems,
    bill.taxRate
  );

  const lines = [
    "APPA FINANCE - SUPPLIER BILL",
    "",
    `Invoice Number: ${bill.invoiceNumber}`,
    `Invoice Date: ${bill.invoiceDate}`,
    `Due Date: ${bill.dueDate}`,
    `Supplier: ${po.supplierName}`,
    `Purchase Order: ${po.poNumber}`,
    "Currency: GBP",
    "",
    "LINE ITEMS",
    ...bill.lineItems.map(
      (item) =>
        `${item.description} ${Number(
          item.quantity || 0
        ).toFixed(2)} ${Number(
          item.unitPrice || 0
        ).toFixed(2)} ${(
          Number(item.quantity || 0) *
          Number(item.unitPrice || 0)
        ).toFixed(2)}`
    ),
    "",
    `Subtotal: GBP ${t.subtotal.toFixed(2)}`,
    `VAT (${bill.taxRate}%): GBP ${t.taxAmount.toFixed(
      2
    )}`,
    `TOTAL: GBP ${t.totalAmount.toFixed(2)}`,
  ];

  return createPdfBlob(lines);
}

export default function PurchaseOrderOperations({
  rows: initialRows = [],
  onRefresh,
}) {
  const [rows, setRows] = useState(
    Array.isArray(initialRows)
      ? initialRows
      : []
  );

  const [suppliers, setSuppliers] =
    useState([]);

  const [query, setQuery] =
    useState("");

  const [mode, setMode] =
    useState("list");

  const [selectedPO, setSelectedPO] =
    useState(null);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [poForm, setPOForm] =
    useState({
      poNumber: uniqueNumber("PO"),
      supplierId: "",
      orderDate: today(),
      taxRate: 18,
      lineItems: [newLine()],
    });

  const [bill, setBill] =
    useState({
      invoiceNumber: uniqueNumber("INV"),
      invoiceDate: today(),
      dueDate: plusDays(30),
      taxRate: 18,
      lineItems: [newLine()],
    });

  async function load() {
    try {
      const [purchaseOrders, supplierRows] =
        await Promise.all([
          getPurchaseOrders(),
          getSuppliers(),
        ]);

      setRows(purchaseOrders);
      setSuppliers(supplierRows);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to refresh finance data."
      );
    }
  }

  useEffect(() => {
    load();

    const timer = window.setInterval(
      load,
      5000
    );

    return () =>
      window.clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    const q = query
      .trim()
      .toLowerCase();

    if (!q) return rows;

    return rows.filter((po) =>
      [
        po.poNumber,
        po.supplierName,
        po.status,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(q)
      )
    );
  }, [rows, query]);

  function updatePOLine(
    index,
    key,
    value
  ) {
    setPOForm((current) => ({
      ...current,
      lineItems:
        current.lineItems.map(
          (item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  [key]: value,
                }
              : item
        ),
    }));
  }

  function updateBillLine(
    index,
    key,
    value
  ) {
    setBill((current) => ({
      ...current,
      lineItems:
        current.lineItems.map(
          (item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  [key]: value,
                }
              : item
        ),
    }));
  }

  async function savePO(event) {
    event.preventDefault();

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const created =
        await createPurchaseOrder({
          ...poForm,
          currency: "GBP",
        });

      setSuccess(
        `${created.poNumber} created successfully.`
      );

      setMode("list");

      setPOForm({
        poNumber: uniqueNumber("PO"),
        supplierId: "",
        orderDate: today(),
        taxRate: 18,
        lineItems: [newLine()],
      });

      await load();
      await onRefresh?.();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to create purchase order."
      );
    } finally {
      setBusy(false);
    }
  }

  async function createBillForPO(po) {
    try {
      setBusy(true);
      setError("");

      const detail =
        await getPurchaseOrder(po.id);

      setSelectedPO(detail);

      setBill({
        invoiceNumber: uniqueNumber("INV"),
        invoiceDate: today(),
        dueDate: plusDays(30),
        taxRate:
          detail.subtotal > 0
            ? Number(
                (
                  (Number(
                    detail.taxAmount || 0
                  ) /
                    Number(
                      detail.subtotal || 1
                    )) *
                  100
                ).toFixed(2)
              )
            : 18,
        lineItems:
          Array.isArray(detail.lineItems) &&
          detail.lineItems.length
            ? detail.lineItems.map(
                (item) => ({
                  description:
                    item.description || "",
                  quantity:
                    Number(
                      item.quantity || 1
                    ),
                  unitPrice:
                    Number(
                      item.unitPrice ||
                        item.unit_price ||
                        0
                    ),
                })
              )
            : [newLine()],
      });

      setMode("bill");
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to load purchase order."
      );
    } finally {
      setBusy(false);
    }
  }

  function downloadBill() {
    if (!selectedPO) return;

    const blob =
      buildBillPdf(
        bill,
        selectedPO
      );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement("a");

    anchor.href = url;
    anchor.download =
      `${bill.invoiceNumber}.pdf`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  }

  async function submitBill() {
    if (!selectedPO) return;

    try {
      setBusy(true);
      setError("");
      setSuccess("");

      const blob =
        buildBillPdf(
          bill,
          selectedPO
        );

      const file = new File(
        [blob],
        `${bill.invoiceNumber}.pdf`,
        {
          type: "application/pdf",
        }
      );

      const result =
        await submitBillToDocuments(
          file
        );

      if (!result.invoice?.id) {
        throw new Error(
          "Bill reached Documents but invoice extraction did not return an invoice."
        );
      }

      const match =
        await matchInvoiceToPO(
          result.invoice.id
        );

      setSuccess(
        `Bill ${bill.invoiceNumber} submitted. ` +
          `Match status: ${
            match?.status || "Processed"
          }${
            match?.score !== undefined
              ? ` (${match.score}%)`
              : ""
          }.`
      );

      setMode("list");
      setSelectedPO(null);

      await load();
      await onRefresh?.();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to submit bill."
      );
    } finally {
      setBusy(false);
    }
  }

  const poTotals =
    totals(
      poForm.lineItems,
      poForm.taxRate
    );

  const billTotals =
    totals(
      bill.lineItems,
      bill.taxRate
    );

  if (mode === "create-po") {
    return (
      <section className="panel procurement-panel">
        <div className="procurement-detail-toolbar">
          <button
            type="button"
            className="procurement-back-button"
            onClick={() =>
              setMode("list")
            }
          >
            <X size={15} />
            Cancel
          </button>
        </div>

        <div className="procurement-detail-hero">
          <div>
            <span className="procurement-eyebrow">
              APPA Procurement
            </span>
            <h2>Create Purchase Order</h2>
            <p>
              Create a GBP purchase order
              for invoice matching.
            </p>
          </div>
        </div>

        <form onSubmit={savePO}>
          <div className="procurement-summary-grid">
            <label>
              <span>PO number</span>
              <input
                value={poForm.poNumber}
                onChange={(e) =>
                  setPOForm({
                    ...poForm,
                    poNumber:
                      e.target.value,
                  })
                }
                required
              />
            </label>

            <label>
              <span>Supplier</span>
              <select
                value={
                  poForm.supplierId
                }
                onChange={(e) =>
                  setPOForm({
                    ...poForm,
                    supplierId:
                      e.target.value,
                  })
                }
                required
              >
                <option value="">
                  Select supplier
                </option>

                {suppliers.map(
                  (supplier) => (
                    <option
                      key={supplier.id}
                      value={supplier.id}
                    >
                      {supplier.name}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <span>Order date</span>
              <input
                type="date"
                value={
                  poForm.orderDate
                }
                onChange={(e) =>
                  setPOForm({
                    ...poForm,
                    orderDate:
                      e.target.value,
                  })
                }
              />
            </label>

            <label>
              <span>VAT %</span>
              <input
                type="number"
                step="0.01"
                value={poForm.taxRate}
                onChange={(e) =>
                  setPOForm({
                    ...poForm,
                    taxRate:
                      e.target.value,
                  })
                }
              />
            </label>
          </div>

          <h3>Line items</h3>

          {poForm.lineItems.map(
            (item, index) => (
              <div
                key={index}
                className="procurement-summary-grid procurement-line-item-row"
              >
                <input
                  placeholder="Description"
                  value={
                    item.description
                  }
                  onChange={(e) =>
                    updatePOLine(
                      index,
                      "description",
                      e.target.value
                    )
                  }
                  required
                />

                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Quantity"
                  value={item.quantity}
                  onChange={(e) =>
                    updatePOLine(
                      index,
                      "quantity",
                      e.target.value
                    )
                  }
                />

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit price"
                  value={item.unitPrice}
                  onChange={(e) =>
                    updatePOLine(
                      index,
                      "unitPrice",
                      e.target.value
                    )
                  }
                />

                <button
                  type="button"
                  className="procurement-secondary-button"
                  onClick={() =>
                    setPOForm({
                      ...poForm,
                      lineItems:
                        poForm.lineItems.filter(
                          (_, i) =>
                            i !== index
                        ),
                    })
                  }
                  disabled={
                    poForm.lineItems
                      .length === 1
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              marginTop: "14px",
              marginBottom: "18px",
              clear: "both",
            }}
          >
            <button
              type="button"
              className="procurement-secondary-button"
              style={{
                width: "auto",
                minWidth: "110px",
              }}
              onClick={() =>
                setPOForm({
                  ...poForm,
                  lineItems: [
                    ...poForm.lineItems,
                    newLine(),
                  ],
                })
              }
            >
              <Plus size={14} />
              Add item
            </button>
          </div>

          <div className="procurement-detail-hero">
            <div>
              <span>Subtotal</span>
              <strong>
                {money(
                  poTotals.subtotal
                )}
              </strong>
            </div>

            <div>
              <span>VAT</span>
              <strong>
                {money(
                  poTotals.taxAmount
                )}
              </strong>
            </div>

            <div>
              <span>Total</span>
              <strong>
                {money(
                  poTotals.totalAmount
                )}
              </strong>
            </div>
          </div>

          <button
            className="primary-button"
            disabled={busy}
          >
            <ShoppingCart size={16} />
            {busy
              ? "Creating..."
              : "Create Purchase Order"}
          </button>
        </form>
      </section>
    );
  }

  if (mode === "bill" && selectedPO) {
    const difference =
      billTotals.totalAmount -
      Number(
        selectedPO.totalAmount || 0
      );

    return (
      <section className="panel procurement-panel">
        <div className="procurement-detail-toolbar">
          <button
            type="button"
            className="procurement-back-button"
            onClick={() => {
              setMode("list");
              setSelectedPO(null);
            }}
          >
            <X size={15} />
            Cancel
          </button>
        </div>

        <div className="procurement-detail-hero">
          <div>
            <span className="procurement-eyebrow">
              APPA Bill Builder
            </span>

            <h2>Create Bill</h2>

            <p>
              Against{" "}
              <strong>
                {selectedPO.poNumber}
              </strong>{" "}
              · {selectedPO.supplierName}
            </p>
          </div>

          <div className="procurement-hero-total">
            <span>PO total</span>
            <strong>
              {money(
                selectedPO.totalAmount
              )}
            </strong>
          </div>
        </div>

        <div className="procurement-summary-grid">
          <label>
            <span>Invoice number</span>
            <input
              value={
                bill.invoiceNumber
              }
              onChange={(e) =>
                setBill({
                  ...bill,
                  invoiceNumber:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            <span>Invoice date</span>
            <input
              type="date"
              value={bill.invoiceDate}
              onChange={(e) =>
                setBill({
                  ...bill,
                  invoiceDate:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            <span>Due date</span>
            <input
              type="date"
              value={bill.dueDate}
              onChange={(e) =>
                setBill({
                  ...bill,
                  dueDate:
                    e.target.value,
                })
              }
            />
          </label>

          <label>
            <span>VAT %</span>
            <input
              type="number"
              step="0.01"
              value={bill.taxRate}
              onChange={(e) =>
                setBill({
                  ...bill,
                  taxRate:
                    e.target.value,
                })
              }
            />
          </label>
        </div>

        <h3>Editable bill items</h3>

        {bill.lineItems.map(
          (item, index) => (
            <div
              key={index}
              className="procurement-summary-grid"
            >
              <input
                value={
                  item.description
                }
                onChange={(e) =>
                  updateBillLine(
                    index,
                    "description",
                    e.target.value
                  )
                }
              />

              <input
                type="number"
                step="0.01"
                value={item.quantity}
                onChange={(e) =>
                  updateBillLine(
                    index,
                    "quantity",
                    e.target.value
                  )
                }
              />

              <input
                type="number"
                step="0.01"
                value={item.unitPrice}
                onChange={(e) =>
                  updateBillLine(
                    index,
                    "unitPrice",
                    e.target.value
                  )
                }
              />

              <strong>
                {money(
                  Number(
                    item.quantity || 0
                  ) *
                    Number(
                      item.unitPrice || 0
                    )
                )}
              </strong>
            </div>
          )
        )}

        <button
          type="button"
          className="procurement-secondary-button"
          onClick={() =>
            setBill({
              ...bill,
              lineItems: [
                ...bill.lineItems,
                newLine(),
              ],
            })
          }
        >
          <Plus size={14} />
          Add bill item
        </button>

        <div className="procurement-detail-hero">
          <div>
            <span>Bill subtotal</span>
            <strong>
              {money(
                billTotals.subtotal
              )}
            </strong>
          </div>

          <div>
            <span>VAT</span>
            <strong>
              {money(
                billTotals.taxAmount
              )}
            </strong>
          </div>

          <div>
            <span>Bill total</span>
            <strong>
              {money(
                billTotals.totalAmount
              )}
            </strong>
          </div>

          <div>
            <span>
              Difference from PO
            </span>

            <strong>
              {difference === 0
                ? "Exact match"
                : money(difference)}
            </strong>
          </div>
        </div>

        <div className="procurement-detail-toolbar">
          <button
            type="button"
            className="procurement-secondary-button"
            onClick={downloadBill}
          >
            <FileDown size={15} />
            Download PDF
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={submitBill}
            disabled={busy}
          >
            <Send size={15} />
            {busy
              ? "Processing..."
              : "Submit to Documents & Match"}
          </button>
        </div>

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="panel procurement-panel">
      <div className="procurement-detail-hero">
        <div>
          <span className="procurement-eyebrow">
            APPA Finance Operations
          </span>

          <h2>Purchase Orders</h2>

          <p>
            Create purchase orders and
            generate supplier bills for
            automated three-way matching.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            setMode("create-po")
          }
        >
          <Plus size={16} />
          Create Purchase Order
        </button>
      </div>

      {success && (
        <p>{success}</p>
      )}

      {error && (
        <p className="error-message">
          {error}
        </p>
      )}

      <div className="procurement-detail-toolbar">
        <div className="procurement-search">
          <Search size={15} />

          <input
            placeholder="Search purchase orders..."
            value={query}
            onChange={(e) =>
              setQuery(e.target.value)
            }
          />
        </div>

        <button
          type="button"
          className="procurement-secondary-button"
          onClick={load}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {!filtered.length ? (
        <div className="enterprise-empty">
          <ShoppingCart size={26} />
          <strong>
            No purchase orders found
          </strong>
        </div>
      ) : (
        <div className="procurement-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Purchase order</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
                <th>Bill</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((po) => (
                <tr key={po.id}>
                  <td>
                    <strong>
                      {po.poNumber}
                    </strong>
                  </td>

                  <td>
                    {po.supplierName}
                  </td>

                  <td>
                    {po.orderDate}
                  </td>

                  <td>
                    <strong>
                      {money(
                        po.totalAmount
                      )}
                    </strong>
                  </td>

                  <td>
                    {po.status}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="procurement-secondary-button"
                      onClick={() =>
                        createBillForPO(
                          po
                        )
                      }
                    >
                      <FileText
                        size={14}
                      />
                      Create Bill
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
