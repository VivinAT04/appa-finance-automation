require("dotenv").config();

const express = require("express");
const cors = require("cors");

require("./database");

const documentRoutes = require("./documentRoutes");
const auditRoutes = require("./auditRoutes");
const invoiceRoutes = require("./invoiceRoutes");
const enterpriseRoutes = require("./enterpriseRoutes");
const authRoutes = require("./authRoutes");
const { requireAuth } = require("./authMiddleware");
const { ensureDevelopmentAdmin } = require("./seedAuthUser");

const app = express();

const PORT = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
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

app.use("/api/documents", requireAuth, documentRoutes);
app.use("/api/audit", requireAuth, auditRoutes);
app.use("/api/invoices", requireAuth, invoiceRoutes);
app.use("/api/enterprise", requireAuth, enterpriseRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);

  res.status(400).json({
    success: false,
    message: error.message || "Request failed.",
  });
});

async function startServer() {
  await ensureDevelopmentAdmin();

  app.listen(PORT, () => {
    console.log("");
    console.log("========================================");
    console.log(" APPA FINANCE BACKEND");
    console.log("========================================");
    console.log(`API:    http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
    console.log(`Auth:   http://localhost:${PORT}/api/auth/login`);
    console.log("========================================");
  });
}

startServer().catch((error) => {
  console.error("APPA backend startup failed:", error);
  process.exit(1);
});
