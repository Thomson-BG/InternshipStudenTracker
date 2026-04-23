#!/usr/bin/env node

const http = require("http");
const { URL } = require("url");

const attendanceHandler = require("../api/v1/attendance");
const adminLoginHandler = require("../api/v1/admin/auth/login");
const studentDashboardHandler = require("../api/v1/dashboard/student");
const adminDashboardHandler = require("../api/v1/dashboard/admin");
const reportsHandler = require("../api/v1/reports");
const rosterHandler = require("../api/v1/roster");
const logsHandler = require("../api/v1/admin/logs");
const pointsHandler = require("../api/v1/admin/points");
const healthHandler = require("../api/v1/health");

const PORT = Number(process.env.DEV_API_PORT || 4301);
const HOST = process.env.DEV_API_HOST || "127.0.0.1";

const routes = new Map([
  ["POST /api/v1/attendance", attendanceHandler],
  ["POST /api/v1/admin/auth/login", adminLoginHandler],
  ["GET /api/v1/dashboard/student", studentDashboardHandler],
  ["GET /api/v1/dashboard/admin", adminDashboardHandler],
  ["GET /api/v1/reports", reportsHandler],
  ["GET /api/v1/roster", rosterHandler],
  ["GET /api/v1/admin/logs", logsHandler],
  ["GET /api/v1/admin/points", pointsHandler],
  ["GET /api/v1/health", healthHandler]
]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function notFound(res) {
  setCors(res);
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({
    ok: false,
    code: "NOT_FOUND",
    message: "Not found."
  }));
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  req.url = `${parsedUrl.pathname}${parsedUrl.search}`;

  const key = `${(req.method || "GET").toUpperCase()} ${parsedUrl.pathname}`;
  const handler = routes.get(key);
  if (!handler) {
    notFound(res);
    return;
  }

  try {
    await handler(req, res);
  } catch (error) {
    console.error("[dev-api] unhandled error", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        ok: false,
        code: "SERVER_ERROR",
        message: error?.message || "Server error."
      }));
    } else {
      try {
        res.end();
      } catch (_) {
        // no-op
      }
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[dev-api] listening on http://${HOST}:${PORT}`);
});
