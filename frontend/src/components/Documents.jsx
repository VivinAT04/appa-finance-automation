import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Upload,
  Search,
  ExternalLink,
  RefreshCw,
  FileCheck2,
  CircleAlert,
  X,
} from "lucide-react";

import {
  getDocuments,
  uploadDocument,
  getDocumentFileUrl,
  processInvoice,
} from "../api";

function formatBytes(bytes) {
  if (!bytes) return "0 KB";

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function Documents({
  uploadRequest = null,
}) {
  const inputRef = useRef(null);
  const handledUploadRequestRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentType, setDocumentType] =
    useState("Invoice");

  async function loadDocuments() {
    try {
      setError("");
      setLoading(true);

      const result = await getDocuments();

      setDocuments(result);
    } catch {
      setError(
        "Could not connect to the APPA backend."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    if (!uploadRequest?.id) return;

    if (
      handledUploadRequestRef.current ===
      uploadRequest.id
    ) {
      return;
    }

    handledUploadRequestRef.current =
      uploadRequest.id;

    if (uploadRequest.documentType) {
      setDocumentType(
        uploadRequest.documentType
      );
    }

    const frame = window.requestAnimationFrame(
      () => {
        inputRef.current?.click();
      }
    );

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [uploadRequest]);

  async function submitUpload(event) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Choose a PDF, PNG or JPG document.");
      return;
    }

    try {
      setError("");
      setUploading(true);

      const uploadedDocument =
        await uploadDocument(
          selectedFile,
          documentType
        );

      if (documentType === "Invoice") {
        const invoice = await processInvoice(
          uploadedDocument.id
        );

        setMessage(
          `Invoice ${invoice.invoiceNumber || selectedFile.name} processed automatically at ${invoice.extractionConfidence}% confidence.`
        );
      } else {
        setMessage(
          `${selectedFile.name} uploaded successfully.`
        );
      }

      setSelectedFile(null);

      if (inputRef.current) {
        inputRef.current.value = "";
      }

      await loadDocuments();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Document upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleProcess(document) {
    if (document.documentType !== "Invoice") {
      setError(
        "Only Invoice documents can use the invoice extractor."
      );
      return;
    }

    try {
      setError("");
      setMessage("");
      setProcessingId(document.id);

      const invoice = await processInvoice(
        document.id
      );

      setMessage(
        `Invoice ${invoice.invoiceNumber || document.originalName} processed at ${invoice.extractionConfidence}% confidence.`
      );

      await loadDocuments();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.message ||
          "Invoice processing failed."
      );

      await loadDocuments();
    } finally {
      setProcessingId(null);
    }
  }

  const filteredDocuments = documents.filter(
    (document) =>
      document.originalName
        .toLowerCase()
        .includes(search.toLowerCase()) ||
      document.documentType
        .toLowerCase()
        .includes(search.toLowerCase())
  );

  return (
    <div className="documents-module">
      <div className="document-summary-grid">
        <article className="document-summary-card">
          <span>Total documents</span>
          <strong>{documents.length}</strong>
          <small>Stored securely in development</small>
        </article>

        <article className="document-summary-card">
          <span>Awaiting extraction</span>
          <strong>
            {
              documents.filter(
                (item) =>
                  item.extractionStatus === "Pending"
              ).length
            }
          </strong>
          <small>Ready for automation</small>
        </article>

        <article className="document-summary-card">
          <span>Invoices</span>
          <strong>
            {
              documents.filter(
                (item) =>
                  item.documentType === "Invoice"
              ).length
            }
          </strong>
          <small>Uploaded invoice documents</small>
        </article>
      </div>

      <div className="documents-layout">
        <section className="panel document-list-panel">
          <div className="panel-heading document-heading">
            <div>
              <h2>Document repository</h2>
              <p>
                Finance documents received by APPA
              </p>
            </div>

            <button
              className="refresh-button"
              onClick={loadDocuments}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>

          <div className="document-toolbar">
            <div className="document-search">
              <Search size={16} />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search documents..."
              />
            </div>
          </div>

          {error && (
            <div className="document-error">
              <CircleAlert size={16} />
              {error}
            </div>
          )}

          {message && (
            <div className="upload-note">
              <strong>Automation completed</strong>
              <span>{message}</span>
            </div>
          )}

          {loading ? (
            <div className="document-empty">
              Loading documents...
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="document-empty">
              <div className="document-empty-icon">
                <FileText size={24} />
              </div>

              <strong>No documents yet</strong>

              <span>
                Upload the first APPA test document
                using the panel on the right.
              </span>
            </div>
          ) : (
            <div className="document-table-wrap">
              <table className="document-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Extraction</th>
                    <th>Uploaded</th>
                    <th />
                  </tr>
                </thead>

                <tbody>
                  {filteredDocuments.map(
                    (document) => (
                      <tr key={document.id}>
                        <td>
                          <div className="document-name-cell">
                            <div className="document-file-icon">
                              <FileText size={17} />
                            </div>

                            <div>
                              <strong>
                                {document.originalName}
                              </strong>

                              <span>
                                {formatBytes(
                                  document.size
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <span className="document-type">
                            {document.documentType}
                          </span>
                        </td>

                        <td>
                          <span className="status status-completed">
                            <span className="status-dot" />
                            {document.status}
                          </span>
                        </td>

                        <td>
                          <span className="status status-approval">
                            <span className="status-dot" />
                            {document.extractionStatus}
                          </span>
                        </td>

                        <td className="muted">
                          {formatDate(
                            document.createdAt
                          )}
                        </td>

                        <td>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            {document.documentType ===
                              "Invoice" && (
                              <button
                                type="button"
                                className="refresh-button"
                                disabled={
                                  processingId ===
                                  document.id
                                }
                                onClick={() =>
                                  handleProcess(
                                    document
                                  )
                                }
                              >
                                <RefreshCw
                                  size={14}
                                />
                                {processingId ===
                                document.id
                                  ? "Processing"
                                  : document.extractionStatus ===
                                      "Completed"
                                    ? "Reprocess"
                                    : "Process"}
                              </button>
                            )}

                            <a
                              className="document-open"
                              href={getDocumentFileUrl(
                                document.id
                              )}
                              target="_blank"
                              rel="noreferrer"
                              title="Open document"
                            >
                              <ExternalLink
                                size={15}
                              />
                            </a>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="panel upload-panel">
          <div className="panel-heading">
            <div>
              <h2>Upload document</h2>
              <p>
                Add a finance document for processing
              </p>
            </div>
          </div>

          <form
            className="upload-form"
            onSubmit={submitUpload}
          >
            <label className="form-label">
              Document type

              <select
                value={documentType}
                onChange={(event) =>
                  setDocumentType(event.target.value)
                }
              >
                <option>Invoice</option>
                <option>Purchase Order</option>
                <option>Receipt</option>
                <option>Customer Document</option>
                <option>Other</option>
              </select>
            </label>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              hidden
              onChange={(event) =>
                setSelectedFile(
                  event.target.files?.[0] || null
                )
              }
            />

            <button
              type="button"
              className="upload-dropzone"
              onClick={() =>
                inputRef.current?.click()
              }
            >
              <div className="upload-drop-icon">
                <Upload size={21} />
              </div>

              {selectedFile ? (
                <>
                  <strong>
                    {selectedFile.name}
                  </strong>

                  <span>
                    {formatBytes(
                      selectedFile.size
                    )}
                  </span>
                </>
              ) : (
                <>
                  <strong>
                    Choose a document
                  </strong>

                  <span>
                    PDF, PNG or JPG · Maximum 10 MB
                  </span>
                </>
              )}
            </button>

            {selectedFile && (
              <button
                type="button"
                className="clear-file"
                onClick={() => {
                  setSelectedFile(null);

                  if (inputRef.current) {
                    inputRef.current.value = "";
                  }
                }}
              >
                <X size={14} />
                Remove selected file
              </button>
            )}

            <button
              className="primary-button upload-submit"
              disabled={
                !selectedFile || uploading
              }
            >
              {uploading ? (
                "Uploading..."
              ) : (
                <>
                  <FileCheck2 size={16} />
                  Upload for processing
                </>
              )}
            </button>

            <div className="upload-note">
              <strong>Development environment</strong>

              <span>
                Use synthetic or anonymised documents
                only. Do not upload real customer
                financial information.
              </span>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}
