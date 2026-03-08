import { API_ENDPOINTS } from "./config.js";

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    payload = {
      ok: false,
      code: "INVALID_RESPONSE",
      message: "Server returned an unreadable response."
    };
  }

  if (!response.ok && payload.ok !== false) {
    payload = {
      ok: false,
      code: "HTTP_ERROR",
      message: `Server error (${response.status}).`
    };
  }

  if (payload && payload.ok === false) {
    throw payload;
  }

  return payload;
}

export async function submitAttendance(payload) {
  return requestJson(API_ENDPOINTS.submit, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
}

export async function adminAuth(password) {
  return requestJson(API_ENDPOINTS.adminAuth, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ password })
  });
}

export async function fetchStudentDashboard(studentId, range) {
  return requestJson(API_ENDPOINTS.studentDashboard(studentId, range));
}

export async function fetchAdminDashboard({ token, range, site }) {
  return requestJson(API_ENDPOINTS.adminDashboard(token, range, site));
}

export async function fetchReportData({ token, type, range, site, studentId }) {
  return requestJson(API_ENDPOINTS.reportData({ token, type, range, site, studentId }));
}

export async function fetchLogs(token) {
  return requestJson(API_ENDPOINTS.logs(token));
}

export async function fetchPoints(token) {
  return requestJson(API_ENDPOINTS.points(token));
}
