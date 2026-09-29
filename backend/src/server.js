require("dotenv").config();

const express = require("express");
const cors = require("cors");

require("./database");

const documentRoutes = require("./documentRoutes");
const auditRoutes = require("./auditRoutes");
const invoiceRoutes = require("./invoiceRoutes");
const enterpriseRoutes = require("./enterpriseRoutes");

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

app.use("/api/documents", documentRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/enterprise", enterpriseRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);

  res.status(400).json({
    success: false,
    message: error.message || "Request failed.",
  });
});

app.listen(PORT, () => {
  console.log("");
  console.log("========================================");
  console.log(" APPA FINANCE BACKEND");
  console.log("========================================");
  console.log(`API:    http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`Docs:   http://localhost:${PORT}/api/documents`);
  console.log("========================================");
});
