# APPA AP Workflow Test Scenarios

These scenarios contain synthetic data only.

They are designed to demonstrate deterministic accounts-payable
workflow behaviour without using real customer, supplier, payment,
or transaction information.

## Scenario 1 — Clean Match

Expected result:

- Supplier matches
- PO reference exists
- Currency matches
- Subtotal matches
- Tax matches
- Total matches
- Invoice lines match PO lines
- Match status becomes `Matched`
- Automatic approval is recorded
- No open exception remains

## Scenario 2 — Amount Mismatch

Expected result:

- Supplier and PO reference are valid
- Invoice amount differs from PO
- Match status becomes `Exception`
- Amount and/or line-item exception is recorded
- Automatic approval must not occur

## Scenario 3 — Missing PO

Expected result:

- Invoice contains no purchase-order reference
- Match status becomes `Exception`
- `MISSING_PO_REFERENCE` exception is recorded
- Automatic approval must not occur

## Scenario 4 — Duplicate Invoice

Expected result:

- A second invoice reuses the clean invoice's invoice number
- Supplier and amount are also the same
- Duplicate detection identifies the record
- Match status becomes `Exception`
- `DUPLICATE_INVOICE` exception is recorded
- Automatic approval must not occur

## Safety

Scenario documents are synthetic database records and are identified
with the prefix:

`APPA-SCN-`

The scenario reset operation targets only records created with that
prefix.

No production or real-world financial information is required.
