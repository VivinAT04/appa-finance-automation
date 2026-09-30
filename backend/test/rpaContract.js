require("dotenv").config();

const assert =
  require("assert");

const {
  QUEUE_NAME,
  ALLOWED_RESULTS,
} = require(
  "../src/rpaTransactionService"
);

assert.strictEqual(
  QUEUE_NAME,
  "APPA-INVOICE-MATCHING"
);

for (
  const status
  of [
    "Successful",
    "BusinessException",
    "ApplicationException",
  ]
) {
  assert.strictEqual(
    ALLOWED_RESULTS.has(status),
    true
  );

  console.log(
    `✓ ${status} supported`
  );
}

assert.strictEqual(
  ALLOWED_RESULTS.has(
    "RandomStatus"
  ),
  false
);

console.log(
  "✓ Invalid status rejected"
);

console.log(
  "✓ Queue: " + QUEUE_NAME
);

console.log("");
console.log(
  "APPA RPA CONTRACT PASSED ✓"
);
