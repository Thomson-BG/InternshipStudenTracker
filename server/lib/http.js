function setCommonHeaders(res) {
  res.setHeader("Cache-Control", "no-store");
}

function sendJson(res, statusCode, payload) {
  setCommonHeaders(res);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function ok(res, payload) {
  return sendJson(res, 200, payload);
}

function fail(res, code, message, extra = {}, statusCode = 400) {
  return sendJson(res, statusCode, {
    ok: false,
    code,
    message,
    ...extra
  });
}

function methodNotAllowed(res, allowed = []) {
  if (allowed.length) {
    res.setHeader("Allow", allowed.join(", "));
  }
  return sendJson(res, 405, {
    ok: false,
    code: "METHOD_NOT_ALLOWED",
    message: "Method not allowed."
  });
}

function notFound(res) {
  return sendJson(res, 404, {
    ok: false,
    code: "NOT_FOUND",
    message: "Not found."
  });
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) {
    return {};
  }
  return JSON.parse(text);
}

function getQueryValue(req, key, fallback = "") {
  if (req.query && Object.prototype.hasOwnProperty.call(req.query, key)) {
    return String(req.query[key] || "");
  }

  const url = req.url || "";
  const questionIndex = url.indexOf("?");
  if (questionIndex === -1) {
    return fallback;
  }
  const search = new URLSearchParams(url.slice(questionIndex + 1));
  return String(search.get(key) || fallback);
}

function getTokenFromRequest(req) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return String(getQueryValue(req, "token", "")).trim();
}

module.exports = {
  sendJson,
  ok,
  fail,
  methodNotAllowed,
  notFound,
  parseJsonBody,
  getQueryValue,
  getTokenFromRequest
};
