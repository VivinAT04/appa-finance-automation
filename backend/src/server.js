require("dotenv").config();

const express = require("express");
const cors = require("cors");

require("./database");

const documentRoutes = require("./documentRoutes");
const auditRoutes = require("./auditRoutes");
const invoiceRoutes = require("./invoiceRoutes");
const enterpriseRoutes = require("./enterpriseRoutes");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const rpaRoutes = require("./rpaRoutes");
const { requireRpaRobot } = require("./rpaAuth");
const { requireAuth } = require("./authMiddleware");
const {
  requireOrganisation,
} = require("./organisationContext");
const { ensureDevelopmentAdmin } = require("./seedAuthUser");

const app = express();

const PORT = Number(process.env.PORT || 4000);

const configuredOrigins = String(
  process.env.CORS_ORIGINS || ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...configuredOrigins,
]);

app.use(
  cors({
    origin(origin, callback) {
      // Requests without an Origin header include
      // server-to-server clients such as UiPath.
      if (
        !origin ||
        allowedOrigins.has(origin)
      ) {
        return callback(null, true);
      }

      return callback(
        new Error(
          `Origin ${origin} is not allowed by APPA CORS policy.`
        )
      );
    },
    credentials: true,
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    application: "APPA Finance Automation Platform",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);


app.use(
  "/api/rpa",
  requireRpaRobot,
  rpaRoutes
);


app.use(
  "/api/users",
  requireAuth,
  requireOrganisation,
  userRoutes
);

app.use(
  "/api/documents",
  requireAuth,
  requireOrganisation,
  documentRoutes
);
app.use(
  "/api/audit",
  requireAuth,
  requireOrganisation,
  auditRoutes
);
app.use(
  "/api/invoices",
  requireAuth,
  requireOrganisation,
  invoiceRoutes
);
app.use(
  "/api/enterprise",
  requireAuth,
  requireOrganisation,
  enterpriseRoutes
);

app.use((error, _req, res, _next) => {
  console.error(error);

  res.status(400).json({
    success: false,
    message: error.message || "Request failed.",
  });
});

async function initialiseApplication() {
  await ensureDevelopmentAdmin();
}

if (require.main === module) {
  initialiseApplication()
    .then(() => {
      app.listen(PORT, () => {
        console.log("");
        console.log("========================================");
        console.log(" APPA FINANCE BACKEND");
        console.log("========================================");
        console.log(
          `API:    http://localhost:${PORT}`
        );
        console.log(
          `Health: http://localhost:${PORT}/api/health`
        );
        console.log(
          `Auth:   http://localhost:${PORT}/api/auth/login`
        );
        console.log("========================================");
      });
    })
    .catch((error) => {
      console.error(
        "APPA backend startup failed:",
        error
      );
      process.exit(1);
    });
}

module.exports = {
  app,
  initialiseApplication,
};
