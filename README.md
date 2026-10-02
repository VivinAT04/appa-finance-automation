# APPA Finance Automation

> Enterprise-style Accounts Payable automation platform integrating React, Node.js, PostgreSQL, UiPath Automation Cloud, UiPath Orchestrator, UiPath Studio Web, Document Understanding, authenticated RPA APIs, exception handling, automation monitoring, and audit logging.

---

## Overview

APPA Finance Automation is a full-stack Accounts Payable and Robotic Process Automation project.

The platform demonstrates how a finance application can integrate with a real RPA platform through authenticated REST APIs and transaction queues.

The solution combines:

- React and Vite frontend
- Node.js and Express backend
- PostgreSQL persistence
- JWT authentication
- Organisation-aware authorization
- Invoice and document processing
- Supplier management
- Purchase order management
- Invoice-to-PO matching
- Approval workflows
- Exception management
- Automation monitoring
- Audit logging
- UiPath Automation Cloud
- UiPath Studio Web
- UiPath Orchestrator Queues
- UiPath Dispatcher workflow
- UiPath Performer workflow
- UiPath Document Understanding
- Authenticated RPA REST APIs
- Production robot callbacks

The project uses synthetic finance data and does not require real customer financial information.

---

## Business Problem

Accounts Payable teams regularly process supplier invoices and compare them with purchase orders.

A typical AP workflow involves:

1. Receiving an invoice.
2. Extracting invoice information.
3. Validating required fields.
4. Identifying the supplier.
5. Locating the referenced purchase order.
6. Comparing invoice and purchase-order values.
7. Checking line items.
8. Checking subtotal, tax, and total values.
9. Identifying discrepancies.
10. Routing invoices for approval.
11. Investigating exceptions.
12. Recording processing outcomes.
13. Maintaining an audit trail.

APPA models these operations as a structured finance and automation workflow.

---

## Architecture

    Finance User
         |
         v
    React Frontend
         |
         v
    Node.js / Express API
         |
         +-------------------------+
         |                         |
         v                         v
    PostgreSQL                 APPA RPA API
                                   |
                                   v
                            UiPath Dispatcher
                                   |
                                   v
                         APPA-INVOICE-MATCHING
                            Orchestrator Queue
                                   |
                                   v
                            UiPath Performer
                                   |
                                   v
                          APPA Result Callback
                                   |
                                   v
                              PostgreSQL
                                   |
                         Automation + Audit

---

## End-to-End Accounts Payable Workflow

    Invoice Document
           |
           v
      Document Intake
           |
           v
      Data Extraction
           |
           v
        Validation
           |
           v
    Supplier Resolution
           |
           v
    Purchase Order Resolution
           |
           v
    Invoice-to-PO Matching
           |
       +---+---+
       |       |
       v       v
    Normal   Finance
     Flow    Exception
       |       |
       v       v
    Approval Investigation
       |       |
       +---+---+
           |
           v
      APPA RPA API
           |
           v
    UiPath Dispatcher
           |
           v
    Orchestrator Queue
           |
           v
     UiPath Performer
           |
       +---+------------------+
       |                      |
       v                      v
    Successful              Failed
                              |
                         +----+----+
                         |         |
                         v         v
                     Business  Application
                     Exception  Exception
                         |         |
                         +----+----+
                              |
                              v
                       Result Processing
                              |
                              v
                         PostgreSQL
                              |
                              v
                    Automation + Audit

---

## Technology Stack

### Frontend

- React
- Vite
- React Router
- Axios
- Lucide React
- CSS

### Backend

- Node.js
- Express
- PostgreSQL pg driver
- JSON Web Tokens
- bcryptjs
- Multer
- pdf-parse
- REST APIs

### Database

- PostgreSQL
- Supabase-hosted PostgreSQL

### RPA

- UiPath Automation Cloud
- UiPath Studio Web
- UiPath Orchestrator
- Orchestrator Queues
- UiPath Assets
- UiPath Secrets
- UiPath HTTP Request activities
- UiPath Document Understanding

### Deployment

- Vercel
- Supabase
- GitHub

---

## Application Modules

The application provides the following operational areas:

- Dashboard
- Documents
- Invoices
- Purchase Orders
- Suppliers
- Approvals
- Automation
- Exceptions
- Audit Logs
- Reports
- Users
- Settings

---

## Documents

The Documents module represents source documents entering the Accounts Payable workflow.

Document state is separated from invoice state so the application can independently represent the original source file, extracted information, invoice processing, and automation state.

---

## Invoices

Invoices are core finance entities within APPA.

Invoice transaction information can include:

- Invoice ID
- Invoice number
- Supplier
- Purchase order number
- Currency
- Subtotal
- Tax amount
- Total amount
- Invoice date
- Due date
- Extraction confidence
- Validation status
- Match status
- Document ID
- Document name
- Line items

Invoices participate in validation, supplier resolution, purchase-order resolution, matching, approvals, exception handling, RPA processing, and auditing.

---

## Suppliers

The Suppliers module manages supplier information used during Accounts Payable processing.

Supplier data provides business context for invoice and purchase-order transactions.

---

## Purchase Orders

Purchase orders represent expected purchasing information against which invoice information can be compared.

They participate in invoice matching and discrepancy identification.

---

## Invoice-to-PO Matching

APPA models invoice-to-purchase-order matching as a finance process.

Matching can consider:

- Supplier
- Purchase order number
- Currency
- Line items
- Quantities
- Unit values
- Subtotal
- Tax
- Total

Finance matching status is independent from robot execution status.

For example:

    Finance Match Status: Exception
    UiPath Status: Successful

This means the robot successfully processed its transaction while the accounting discrepancy still requires finance review.

---

## Approvals

Approval state remains separate from robot execution.

This prevents automation success from silently replacing a required finance decision.

APPA therefore separates:

    Automation State
    Business Rule State
    Human Approval State

---

## Exception Management

The application distinguishes between finance and automation exceptions.

Examples include:

- Invoice mismatch
- Validation failure
- Missing finance information
- RPA Business Exception
- RPA Application Exception

This allows operational failures to be investigated according to their actual cause.

---

## UiPath Architecture

UiPath is implemented as an external automation layer.

The project uses a transaction-oriented Dispatcher and Performer design:

    APPA Backend
         |
         v
    UiPath Dispatcher
         |
         v
    Orchestrator Queue
         |
         v
    UiPath Performer
         |
         v
    APPA Callback API

The architecture uses REFramework-style transaction separation concepts, but the Performer is not documented as an untouched canonical UiPath REFramework template.

---

## UiPath Dispatcher

The Dispatcher requests structured invoice work from APPA and creates UiPath Orchestrator queue transactions.

The implemented workflow contains:

    Manual Trigger
          |
          v
       Get Asset
          |
          v
       Get Secret
          |
          v
       Get Secret
          |
          v
       Get Asset
          |
          v
      HTTP Request
          |
          v
      Log Message
          |
          v
    Deserialize JSON
          |
          v
       For Each
          |
          v
    Add Queue Item

UiPath configuration names include:

- APPA_API_BASE_URL
- APPA_ORGANISATION_ID
- APPA_RPA_API_KEY
- VERCEL_AUTOMATION_BYPASS_SECRET

Secret values are not stored in this repository.

---

## Orchestrator Queue

The UiPath queue used by APPA is:

    APPA-INVOICE-MATCHING

The queue acts as the transaction boundary between Dispatcher and Performer.

Queue Specific Data can contain:

- InvoiceId
- InvoiceNumber
- SupplierName
- PurchaseOrderNumber
- Currency
- Subtotal
- TaxAmount
- TotalAmount
- InvoiceDate
- DueDate
- ExtractionConfidence
- ValidationStatus
- MatchStatus
- DocumentId
- DocumentName
- LineItemsJson

A synthetic QA transaction used during implementation has the reference:

    APPA-QA-INV-001

---

## UiPath Performer

The Performer retrieves a transaction from the Orchestrator queue and processes it.

The implemented flow is:

    Manual Trigger
          |
          v
    Get Transaction Item
          |
          v
      Log Transaction
          |
          v
        Try / Catch
          |
     +----+-----------------------+
     |                            |
     v                            v
    Try                         Catch
     |                            |
     v                       +----+----+
Load APPA Config             |         |
     |                       v         v
     v                   Business  Application
Process Transaction         Error      Error
     |                       |         |
     v                       v         v
POST Result              Failed     Failed
     |                    Business   Application
     v
Successful Transaction

---

## Business Exception Handling

A Business Exception represents a transaction that can technically be processed but violates a business rule.

A controlled UiPath test used:

    APPA TEST: Invoice failed business validation

UiPath Orchestrator recorded:

    Status: Failed
    Exception: Business

This verifies the Business Exception branch in the Performer transaction lifecycle.

---

## Application Exception Handling

An Application Exception represents a technical processing problem.

Examples include:

- API failure
- Network failure
- Unexpected runtime failure
- Unavailable dependency
- Invalid technical response

A controlled test used:

    APPA TEST: Simulated application/API failure

UiPath Orchestrator recorded:

    Status: Failed
    Exception: Application

This verifies the Application Exception branch.

---

## Document Understanding

The project includes a real UiPath Document Understanding workflow.

A separate Studio Web project uses:

    Extract Document Data

with:

    Project: Predefined
    Document Type: Invoices

A synthetic APPA invoice PDF was supplied to the workflow.

The workflow successfully executed the UiPath invoice extraction model and returned the generated invoice document-data object.

This verifies execution of the real UiPath Document Understanding activity.

The current verification does not claim that every individual extracted field was independently validated against the source PDF.

---

## Synthetic QA Invoice

The synthetic test invoice contains information including:

    Supplier: Demo Office Supplies Ltd
    Invoice Number: APPA-QA-INV-001
    Invoice Date: 2026-09-30
    Due Date: 2026-10-30
    Purchase Order: PO-TEST-1001
    Currency: INR
    Subtotal: 23000
    GST 18 percent: 4140
    Total: 27140

The test document contains no real customer financial information.

---

## RPA REST API

The backend exposes dedicated endpoints for UiPath:

    GET  /api/rpa/health
    GET  /api/rpa/work-items
    GET  /api/rpa/work-items/:invoiceId
    POST /api/rpa/results

### Health

GET /api/rpa/health provides an integration health endpoint.

### Work Items

GET /api/rpa/work-items returns structured invoice transactions for the Dispatcher.

### Individual Work Item

GET /api/rpa/work-items/:invoiceId returns a specific invoice transaction.

### Results

POST /api/rpa/results receives robot processing results.

Supported callback statuses are:

- Successful
- BusinessException
- ApplicationException

Invalid statuses are rejected by the RPA contract.

---

## RPA Authentication

The RPA API uses server-to-server authentication.

UiPath sends:

    x-rpa-api-key
    x-organisation-id

The production automation can additionally provide the configured deployment-protection bypass credential where required.

The backend:

1. requires an RPA API key;
2. validates the key format;
3. performs a timing-safe comparison;
4. requires an organisation identifier;
5. verifies that the organisation exists;
6. verifies that the organisation is active;
7. attaches verified organisation context to the request.

Credentials are not committed to source control.

---

## Robot Result Processing

Robot callbacks are handled by the RPA transaction service.

    Receive Callback
          |
          v
    Authenticate Robot
          |
          v
    Validate Organisation
          |
          v
      Validate Status
          |
          v
      Resolve Invoice
          |
          v
    Record Automation Run
          |
          v
    Apply RPA Exception
       State if Required
          |
          v
      Write Audit Event
          |
          v
       Return Result

---

## Finance-State Integration

Robot success does not overwrite accounting match state.

For example:

    UiPath Execution: Successful
    Invoice Match Status: Exception

means UiPath successfully processed the automation transaction while the finance discrepancy still exists.

This prevents automation status from incorrectly becoming accounting truth.

---

## Automation Runs

RPA processing is persisted through the automation-runs model.

A verified successful transaction recorded information including:

    Process: UiPath Invoice Performer
    Source: APPA UiPath Robot
    Status: Completed
    Items Processed: 1
    Items Succeeded: 1
    Items Failed: 0
    Organisation: APPA Finance

---

## RPA Exception Integration

The backend supports RPA-created exception records.

BusinessException can create or update:

    RPA Business Exception

with medium severity.

ApplicationException can create or update:

    RPA Application Exception

with high severity.

The backend prevents duplicate open RPA exceptions for the same processing context.

Successful processing resolves only applicable RPA-created exceptions and does not automatically resolve unrelated finance exceptions.

---

## Audit Logging

Implemented RPA audit events include:

- RPA_RESULT_RECEIVED
- RPA_EXCEPTION_CREATED
- RPA_EXCEPTION_RESOLVED
- RPA_TRANSACTION_COMPLETED

This provides traceability between invoices, robot results, automation runs, exceptions, and organisations.

---

## Authentication and Authorization

The finance application uses authenticated backend routes.

Application authentication uses JWT-based sessions.

Passwords are handled using hashing rather than plaintext storage.

The frontend maintains authenticated user context and organisation workspace state.

---

## Organisation Isolation

APPA is organisation-aware.

Organisation-scoped requests require valid organisation context.

The backend verifies whether an authenticated user can operate within the requested organisation.

The RPA integration also requires organisation context.

---

## PostgreSQL

PostgreSQL is the runtime database.

The application uses hosted PostgreSQL rather than a local SQLite database for deployment.

The database layer provides asynchronous helpers for:

- query
- one
- many
- execute
- transaction
- healthCheck
- close

Database transactions use BEGIN, COMMIT, and ROLLBACK semantics.

---

## Testing

The active release validation includes:

    npm run test:rpa
    npm run test:readiness
    npm run test:release

The RPA contract verifies:

- Successful status support
- BusinessException status support
- ApplicationException status support
- Invalid status rejection
- APPA-INVOICE-MATCHING queue contract

The release-readiness audit verifies application structure, security wiring, required navigation, organisation handling, and regression-test presence.

The frontend is validated using:

    npm run lint
    npm run build

Backend JavaScript is validated using Node syntax checks.

---

## Legacy Regression Tests

The repository contains:

- backend/test/crossOrganisationIsolation.js
- backend/test/userAdministrationIsolation.js

These tests use an older SQLite-style db.prepare interface.

The production application now uses asynchronous PostgreSQL helpers.

They are therefore retained as regression references but are not included in the active PostgreSQL release suite until migrated.

---

## Security

Security controls include:

- Real environment files excluded from Git
- JWT application authentication
- Password hashing
- Organisation access validation
- Dedicated RPA API authentication
- Timing-safe RPA key comparison
- UiPath Secrets
- UiPath Assets
- Deployment-protection integration
- No runtime database committed to Git
- No Vercel project metadata committed to Git

---

## Environment Variables

Backend configuration includes names such as:

- APPA_ADMIN_EMAIL
- APPA_ADMIN_NAME
- APPA_ADMIN_PASSWORD
- CORS_ORIGINS
- DATABASE_POOL_MAX
- DATABASE_URL
- JWT_SECRET
- NODE_ENV
- PORT
- RPA_API_KEY

Frontend configuration includes:

- VITE_API_URL

Real secret values must never be committed.

---

## Deployment

The hosted architecture is:

    GitHub
       |
       v
    Vercel
       |
       +------------------+
       |                  |
       v                  v
    Frontend           Backend
                          |
                          v
                  Supabase PostgreSQL
                          ^
                          |
                    APPA RPA API
                          ^
                          |
                  UiPath Automation
                       Cloud

---

## Verified Production RPA Flow

The production integration has been verified through:

1. RPA health endpoint.
2. Dispatcher work-item retrieval.
3. Orchestrator queue insertion.
4. Performer queue retrieval.
5. Successful Performer execution.
6. Production result callback.
7. PostgreSQL automation-run persistence.
8. RPA audit-event persistence.

A real UiPath execution successfully processed the synthetic APPA-QA-INV-001 transaction and returned a successful callback to the deployed APPA backend.

---

## Repository Structure

    appa-finance-automation/
    |
    +-- README.md
    +-- .gitignore
    |
    +-- backend/
    |   +-- api/
    |   +-- scripts/
    |   +-- src/
    |   +-- test/
    |   +-- package.json
    |   +-- .env.example
    |
    +-- frontend/
    |   +-- public/
    |   +-- src/
    |   +-- package.json
    |   +-- eslint.config.js
    |   +-- vite.config.js
    |   +-- .env.example
    |
    +-- docs/
    |   +-- AP-WORKFLOW-SCENARIOS.md
    |
    +-- sample-data/

---

## Running Locally

### Backend

    cd backend
    npm install
    npm run dev

Configure the required local environment variables using backend/.env.example as the reference.

### Frontend

    cd frontend
    npm install
    npm run dev

### Production Build

    cd frontend
    npm run build

### Lint

    cd frontend
    npm run lint

### RPA Contract

    cd backend
    npm run test:rpa

### Release Readiness

    cd backend
    npm run test:readiness

### Release Suite

    cd backend
    npm run test:release

---

## Verified Capabilities

- React finance application
- Node.js and Express backend
- PostgreSQL runtime persistence
- Hosted PostgreSQL connectivity
- JWT authentication
- Organisation-aware application architecture
- User-management capability
- Finance approval capability
- Audit capability
- Invoice processing
- Supplier management
- Purchase-order management
- Invoice matching
- Finance exception management
- Automation-run tracking
- Authenticated RPA API
- RPA health endpoint
- RPA work-item endpoints
- RPA result callback
- UiPath Dispatcher
- Real Orchestrator queue insertion
- APPA-INVOICE-MATCHING queue
- UiPath Performer
- Successful production UiPath callback
- UiPath Business Exception handling
- UiPath Application Exception handling
- UiPath Document Understanding execution
- Automation-run persistence
- RPA audit integration
- Frontend production build
- Frontend lint validation
- Backend syntax validation
- RPA contract validation
- Release-readiness validation

---

## Known Boundaries

### Exception Callbacks

The backend supports BusinessException and ApplicationException callback statuses.

The current verified Performer exception branches correctly set Orchestrator transaction status.

Those catch branches have not yet been verified sending their exception result back to /api/rpa/results.

### Document Understanding

The actual UiPath Document Understanding activity executed successfully and returned an invoice document-data object.

Individual extracted fields have not yet been independently verified field-by-field against the PDF.

### REFramework

The automation follows transaction-oriented Dispatcher and Performer concepts and uses REFramework-style separation.

It is not documented as an untouched canonical REFramework template implementation.

### Empty Queue Handling

The current Performer assumes a transaction is available before some top-level logging.

Explicit empty-queue handling is a future robustness improvement.

### Legacy Tests

Two older isolation tests still use the previous SQLite-style database interface and require migration to the PostgreSQL helper interface.

---

## Future Enhancements

- Send BusinessException callbacks from the Performer catch branch.
- Send ApplicationException callbacks from the Performer catch branch.
- Add explicit empty-queue handling.
- Validate Document Understanding results field-by-field.
- Migrate legacy isolation tests to PostgreSQL.
- Add scheduled unattended robot execution.
- Add queue retry strategies.
- Expand integration testing.
- Add CI/CD validation.
- Add richer automation dashboards.
- Add operational alerting.
- Expand finance reconciliation reporting.

---

## Project Status

    Frontend                     Verified
    Backend                      Verified
    PostgreSQL                   Verified
    RPA API                      Verified
    UiPath Dispatcher            Verified
    Orchestrator Queue           Verified
    UiPath Performer             Verified
    Successful RPA Callback      Verified
    Business Exception Path      Verified in Orchestrator
    Application Exception Path   Verified in Orchestrator
    Document Understanding       Verified Execution
    Automation Persistence       Verified
    RPA Audit Integration        Verified
    Frontend Lint                Passing
    Frontend Production Build    Passing
    Backend Syntax               Passing
    RPA Contract                 Passing
    Release Readiness Audit      Passing

---

## Summary

APPA Finance Automation demonstrates how Accounts Payable operations, full-stack engineering, PostgreSQL, REST APIs, UiPath automation, Orchestrator queues, Document Understanding, exception handling, security, and auditability can be integrated into one enterprise-style automation project.

The implementation deliberately distinguishes verified functionality from future enhancements and keeps finance state independent from robot execution state.
