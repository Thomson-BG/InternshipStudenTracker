import { API_ENDPOINTS, ROSTER_FALLBACK } from "./config.js";

function isStudentDashboardPayloadUsable(data) {
  const studentId = data?.student?.studentId || data?.student?.id;
  return Boolean(studentId && data?.today && (data?.week || data?.summaries?.week));
}

function normalizeStudentDashboardPayload(data, range = "week") {
  if (!data) {
    return data;
  }

  const weekSummary = data.week || data.summaries?.week || {};
  return {
    ...data,
    currentRange: data.currentRange || range,
    student: {
      ...data.student,
      name: data?.student?.name || data?.student?.studentName || data?.student?.studentId || ""
    },
    week: {
      totalPoints: Number(weekSummary.totalPoints ?? weekSummary.points ?? 0),
      hoursDecimal: Number(weekSummary.hoursDecimal ?? weekSummary.hours ?? 0)
    }
  };
}

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

function authHeaders(token) {
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`
  };
}

export async function submitAttendance(payload) {
  return requestJson(API_ENDPOINTS.submit, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
}

export async function adminAuth(password) {
  return requestJson(API_ENDPOINTS.adminAuth, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8"
    },
    body: JSON.stringify({ password })
  });
}

export async function fetchStudentDashboard(studentId, range = "week", options = {}) {
  const response = await requestJson(API_ENDPOINTS.studentDashboard(studentId, range), options);
  if (!response?.data || !isStudentDashboardPayloadUsable(response.data)) {
    throw {
      ok: false,
      code: "UNUSABLE_RESPONSE",
      message: "Student dashboard response was incomplete."
    };
  }

  return {
    ...response,
    data: normalizeStudentDashboardPayload(response.data, range),
    meta: {
      ...(response.meta || {}),
      source: response.meta?.source || "neondb"
    }
  };
}

export async function fetchAdminDashboard({ token, range, site }, options = {}) {
  const normalizedRange = range || "overall";
  const normalizedSite = site || "all";

  const response = await requestJson(API_ENDPOINTS.adminDashboard(normalizedRange, normalizedSite), {
    ...options,
    headers: {
      ...(options?.headers || {}),
      ...authHeaders(token)
    }
  });

  return {
    ok: true,
    data: response.data,
    meta: response.meta || {
      source: response.data?.source || "neondb",
      dataQuality: response.data?.dataQuality || "ok",
      fallbackUsed: false,
      diagnostics: response.data?.diagnostics || {}
    }
  };
}

export async function fetchReportData({ token, type, range, site, studentId }) {
  return requestJson(API_ENDPOINTS.reportData({ type, range, site, studentId }), {
    headers: {
      ...authHeaders(token)
    }
  });
}

export async function fetchLogs(token) {
  return requestJson(API_ENDPOINTS.logs(), {
    headers: {
      ...authHeaders(token)
    }
  });
}

export async function fetchPoints(token) {
  return requestJson(API_ENDPOINTS.points(), {
    headers: {
      ...authHeaders(token)
    }
  });
}

export async function fetchRoster(options = {}) {
  try {
    return await requestJson(API_ENDPOINTS.getRoster(), options);
  } catch (error) {
    return {
      ok: true,
      data: { ...ROSTER_FALLBACK }
    };
  }
}
