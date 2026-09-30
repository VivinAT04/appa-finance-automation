const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");

function read(relativePath) {
  const absolutePath = path.join(
    root,
    relativePath
  );

  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Required file missing: ${relativePath}`
    );
  }

  return fs.readFileSync(
    absolutePath,
    "utf8"
  );
}

function check(condition, message) {
  if (!condition) {
    throw new Error(message);
  }

  console.log(`✓ ${message}`);
}

function containsAny(source, values) {
  return values.some(
    (value) => source.includes(value)
  );
}

console.log("");
console.log(
  "APPA V1 RELEASE READINESS AUDIT"
);
console.log(
  "================================"
);

const app = read(
  "frontend/src/App.jsx"
);

const api = read(
  "frontend/src/api.js"
);

const server = read(
  "backend/src/server.js"
);

const accessControl = read(
  "backend/src/accessControl.js"
);

const organisationContext = read(
  "backend/src/organisationContext.js"
);

const userRoutes = read(
  "backend/src/userRoutes.js"
);

check(
  api.includes("appa_auth_token"),
  "frontend authentication token storage configured"
);

check(
  api.includes("appa_organisation_id"),
  "frontend organisation storage configured"
);

check(
  api.includes("X-Organisation-Id"),
  "organisation header interceptor configured"
);

check(
  api.includes('api.get("/auth/me")'),
  "authoritative authenticated-user endpoint used"
);

check(
  app.includes(
    "const user = await getCurrentUser();"
  ),
  "login refreshes authoritative user context"
);

check(
  app.includes(
    "setSelectedOrganisationId("
  ),
  "workspace selection state configured"
);

check(
  app.includes(
    "getStoredOrganisationId();"
  ),
  "workspace restored from persisted organisation"
);

check(
  organisationContext.includes(
    "ORGANISATION_REQUIRED"
  ),
  "missing organisation requests rejected"
);

check(
  organisationContext.includes(
    "ORGANISATION_ACCESS_DENIED"
  ),
  "unauthorised organisation access rejected"
);

check(
  accessControl.includes(
    "users.manage"
  ),
  "user-management capability configured"
);

check(
  accessControl.includes(
    "finance.approve"
  ),
  "finance approval capability configured"
);

check(
  accessControl.includes(
    "audit.read"
  ),
  "audit capability configured"
);

check(
  userRoutes.includes(
    "GLOBAL_ROLE_CONFLICT"
  ),
  "multi-organisation global-role conflict protected"
);

check(
  containsAny(
    server,
    [
      "requireAuth",
      "authMiddleware",
    ]
  ),
  "authenticated backend routing configured"
);

const expectedNavigation = [
  "Dashboard",
  "Documents",
  "Invoices",
  "Purchase Orders",
  "Suppliers",
  "Approvals",
  "Automation",
  "Exceptions",
  "Audit Logs",
  "Reports",
  "Users",
  "Settings",
];

for (
  const navigationItem
  of expectedNavigation
) {
  check(
    app.includes(
      `"${navigationItem}"`
    ),
    `navigation available: ${navigationItem}`
  );
}

const requiredTests = [
  "backend/test/crossOrganisationIsolation.js",
  "backend/test/userAdministrationIsolation.js",
];

for (
  const testPath
  of requiredTests
) {
  check(
    fs.existsSync(
      path.join(root, testPath)
    ),
    `regression test available: ${testPath}`
  );
}

check(
  fs.existsSync(
    path.join(
      root,
      "frontend/src/assets/appa-logo.png"
    )
  ),
  "APPA brand asset available"
);

console.log("");
console.log(
  "STATIC RELEASE READINESS AUDIT PASSED"
);
console.log("");
console.log(
  "Scope note:"
);
console.log(
  "- This verifies application structure and security wiring."
);
console.log(
  "- External UiPath execution is not asserted by this audit."
);
console.log(
  "- OCR/Document Understanding is not asserted by this audit."
);
