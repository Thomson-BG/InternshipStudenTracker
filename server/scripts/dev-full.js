#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "../..");

function startProcess(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`);
    } else {
      console.log(`[${name}] exited with code ${code}`);
    }
  });

  return child;
}

const apiPort = String(process.env.DEV_API_PORT || "4301");
const appPort = String(process.env.DEV_APP_PORT || "4173");
const host = process.env.DEV_HOST || "127.0.0.1";

const api = startProcess("api", "node", ["server/dev-api.js"], {
  DEV_API_PORT: apiPort,
  DEV_API_HOST: host
});

const viteBin = path.join(root, "node_modules", "vite", "bin", "vite.js");
const web = startProcess("web", "node", [viteBin, "--host", host, "--port", appPort], {
  DEV_API_PORT: apiPort
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  [api, web].forEach((child) => {
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
  });

  setTimeout(() => process.exit(0), 400).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
