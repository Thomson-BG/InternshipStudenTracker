import {
  computeGaugeDash,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatHours,
  formatPercent,
  formatPoints,
  formatShortDate,
  percentileLabel,
  round,
  toRangeLabel
} from "./utils.js";

function progressBar(value) {
  return `<div class="report-bar"><span style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></span></div>`;
}

function accentProgressBar(value) {
  return `<div class="report-bar is-accent"><span style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></span></div>`;
}

function studentReportMarkup(report) {
  const payload = report.payload;
  const selected = payload.selected || {};
  const summaries = payload.summaries || {};
  const historyScope = report.historyScope === "all" ? "all" : "recent";
  const shiftRows = historyScope === "all"
    ? (payload.shiftHistory || payload.recentShifts || [])
    : (payload.recentShifts || []);
  const exceptions = payload.exceptions || [];
  const charts = payload.charts || {};

  return `
    <div class="report-header">
      <div>
        <div class="report-kicker">Intern Track v2</div>
        <h1 class="report-title">${escapeHtml(report.reportTitle)}</h1>
        <p class="report-subtitle">${escapeHtml(report.reportSubtitle)}</p>
      </div>
      <div class="report-meta">
        Generated ${escapeHtml(formatDateTime(report.generatedAt))}<br>
        Student ID ${escapeHtml(payload.student.studentId)}
      </div>
    </div>

    <div class="report-grid">
      <section class="report-card" style="grid-column: span 12;">
        <div class="report-section-header">
          <div>
            <div class="report-kicker">Current Standing</div>
            <h2 class="report-section-title">${escapeHtml(payload.student.studentName)}</h2>
          </div>
          <div class="inline-badge" data-tone="info">${escapeHtml(percentileLabel(selected.percentile))}</div>
        </div>
        <div class="report-stat-grid">
          <div class="report-stat">
            <div class="card-label">${escapeHtml(toRangeLabel(payload.currentRange))} Points</div>
            <div class="metric-value">${escapeHtml(formatPoints(selected.points || 0))}</div>
          </div>
          <div class="report-stat">
            <div class="card-label">${escapeHtml(toRangeLabel(payload.currentRange))} Hours</div>
            <div class="metric-value">${escapeHtml(formatHours(selected.hours || 0))}</div>
          </div>
          <div class="report-stat">
            <div class="card-label">Today Status</div>
            <div class="metric-value">${escapeHtml(payload.today.status || "NOT_STARTED")}</div>
          </div>
          <div class="report-stat">
            <div class="card-label">Next Action</div>
            <div class="metric-value">${escapeHtml(payload.today.nextAction || "Check In")}</div>
          </div>
        </div>
      </section>

      <section class="report-card" style="grid-column: span 6;">
        <div class="report-kicker">Benchmark</div>
        <h2 class="report-section-title">Points vs Top Student</h2>
        <p>${escapeHtml(formatPercent(selected.pointsPctOfTop || 0))}</p>
        ${progressBar(selected.pointsPctOfTop || 0)}
        <p class="report-meta">Gap to top: ${escapeHtml(formatPoints(selected.gapToTopPoints || 0))}</p>
      </section>

      <section class="report-card" style="grid-column: span 6;">
        <div class="report-kicker">Benchmark</div>
        <h2 class="report-section-title">Hours vs Top Student</h2>
        <p>${escapeHtml(formatPercent(selected.hoursPctOfTop || 0))}</p>
        ${accentProgressBar(selected.hoursPctOfTop || 0)}
        <p class="report-meta">Gap to top: ${escapeHtml(formatHours(selected.gapToTopHours || 0))}</p>
      </section>

      <section class="report-card" style="grid-column: span 12;">
        <div class="report-kicker">Week / Month / Overall</div>
        <div class="report-stat-grid">
          ${Object.entries(summaries).map(([range, summary]) => `
            <div class="report-stat">
              <div class="card-label">${escapeHtml(toRangeLabel(range))}</div>
              <div><strong>${escapeHtml(formatPoints(summary.points || 0))}</strong></div>
              <div>${escapeHtml(formatHours(summary.hours || 0))}</div>
              <div class="report-meta">${escapeHtml(formatPercent(summary.pointsPctOfTop || 0))} of top points / ${escapeHtml(formatPercent(summary.hoursPctOfTop || 0))} of top hours</div>
            </div>
          `).join("")}
        </div>
      </section>

      <section class="report-card" style="grid-column: span 12;">
        <div class="report-kicker">Activity Charts</div>
        <div class="report-chart-grid">
          <div class="report-chart-container">
            <canvas id="reportStudentWeeklyActivityChart"></canvas>
          </div>
          <div class="report-chart-container">
            <canvas id="reportStudentCumulativeChart"></canvas>
          </div>
        </div>
      </section>

      <section class="report-card" style="grid-column: span 8;">
        <div class="report-kicker">${historyScope === "all" ? "All Shifts" : "Recent Shifts"}</div>
        <table class="report-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Site</th>
              <th>Status</th>
              <th>Hours</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            ${(shiftRows.length ? shiftRows : [{ localDate: "-", site: "No shifts yet", status: "-", hoursDecimal: 0, totalPoints: 0 }]).map((row) => `
              <tr>
                <td>${escapeHtml(formatDate(row.localDate))}</td>
                <td>${escapeHtml(row.site || "-")}</td>
                <td>${escapeHtml(row.status || "-")}</td>
                <td>${escapeHtml(formatHours(row.hoursDecimal || 0))}</td>
                <td>${escapeHtml(formatPoints(row.totalPoints || 0))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="report-card" style="grid-column: span 4;">
        <div class="report-kicker">Exceptions</div>
        <table class="report-list">
          <tbody>
            ${(exceptions.length ? exceptions : [{ localDate: "-", message: "No open or exception shifts." }]).map((row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(formatDate(row.localDate))}</strong><br>
                  <span class="report-meta">${escapeHtml(row.message || "-")}</span>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

function cohortReportMarkup(report) {
  const payload = report.payload;
  const selected = payload.selected || {};
  const topRows = (payload.leaderboard || []).slice(0, 8);
  const exceptions = payload.exceptions || [];
  const sites = payload.charts?.siteBreakdown || [];

  return `
    <div class="report-header">
      <div>
        <div class="report-kicker">Intern Track v2</div>
        <h1 class="report-title">${escapeHtml(report.reportTitle)}</h1>
        <p class="report-subtitle">${escapeHtml(report.reportSubtitle)}</p>
      </div>
      <div class="report-meta">
        Generated ${escapeHtml(formatDateTime(report.generatedAt))}<br>
        Active students: ${escapeHtml(String(selected.activeStudents || 0))}
      </div>
    </div>

    <div class="report-grid">
      <section class="report-card" style="grid-column: span 12;">
        <div class="report-kicker">KPI Summary</div>
        <div class="report-stat-grid">
          <div class="report-stat"><div class="card-label">Points</div><div class="metric-value">${escapeHtml(formatPoints(selected.pointsTotal || 0))}</div></div>
          <div class="report-stat"><div class="card-label">Hours</div><div class="metric-value">${escapeHtml(formatHours(selected.hoursTotal || 0))}</div></div>
          <div class="report-stat"><div class="card-label">Completed Shifts</div><div class="metric-value">${escapeHtml(String(selected.completedShifts || 0))}</div></div>
          <div class="report-stat"><div class="card-label">Open Shifts</div><div class="metric-value">${escapeHtml(String(selected.openShifts || 0))}</div></div>
          <div class="report-stat"><div class="card-label">Exceptions</div><div class="metric-value">${escapeHtml(String(selected.exceptionCount || 0))}</div></div>
        </div>
      </section>

      <section class="report-card" style="grid-column: span 12;">
        <div class="report-kicker">Trend Charts</div>
        <div class="report-chart-grid">
          <div class="report-chart-container">
            <canvas id="reportAdminOverviewTrendChart"></canvas>
          </div>
        </div>
      </section>

      <section class="report-card" style="grid-column: span 7;">
        <div class="report-kicker">Leaderboard Snapshot</div>
        <table class="report-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Points</th>
              <th>Hours</th>
              <th>Percentile</th>
            </tr>
          </thead>
          <tbody>
            ${topRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.studentName)}</td>
                <td>${escapeHtml(formatPoints(row.points || 0))}</td>
                <td>${escapeHtml(formatHours(row.hours || 0))}</td>
                <td>${escapeHtml(formatPercent(row.percentile || 0))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="report-card" style="grid-column: span 5;">
        <div class="report-kicker">Top Benchmark</div>
        <p><strong>${escapeHtml(selected.topStudentName || "No benchmark yet")}</strong></p>
        <p class="report-meta">Top points: ${escapeHtml(formatPoints(selected.topPoints || 0))}</p>
        <p class="report-meta">Top hours: ${escapeHtml(formatHours(selected.topHours || 0))}</p>
        <div class="report-kicker" style="margin-top:16px;">Site Breakdown</div>
        <table class="report-list">
          <tbody>
            ${sites.map((row) => `
              <tr>
                <td>
                  <strong>${escapeHtml(row.site)}</strong><br>
                  <span class="report-meta">${escapeHtml(formatPoints(row.points || 0))} / ${escapeHtml(formatHours(row.hours || 0))}</span>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>

      <section class="report-card" style="grid-column: span 12;">
        <div class="report-kicker">Exception Watchlist</div>
        <table class="report-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Student</th>
              <th>Status</th>
              <th>Site</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            ${(exceptions.length ? exceptions : [{ localDate: "-", studentName: "No exceptions", status: "-", site: "-", message: "All clear." }]).slice(0, 12).map((row) => `
              <tr>
                <td>${escapeHtml(formatDate(row.localDate))}</td>
                <td>${escapeHtml(row.studentName || "-")}</td>
                <td>${escapeHtml(row.status || "-")}</td>
                <td>${escapeHtml(row.site || "-")}</td>
                <td>${escapeHtml(row.message || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </section>
    </div>
  `;
}

export function renderReportMarkup(report) {
  if (!report) return "";
  if (report.type === "student") {
    return studentReportMarkup(report);
  }
  return cohortReportMarkup(report);
}

export function renderReportCharts(report) {
  if (!report || !report.payload || !report.payload.charts) {
    return;
  }

  if (report.type === "student") {
    const charts = report.payload.charts;
    if (charts.weeklyPoints && charts.weeklyHours && charts.cumulative) {
      const weeklyPoints = charts.weeklyPoints || [];
      const weeklyHours = charts.weeklyHours || [];
      const cumulative = charts.cumulative || [];

      // Render weekly activity chart
      const weeklyActivityCtx = document.getElementById("reportStudentWeeklyActivityChart");
      if (weeklyActivityCtx) {
        const existing = window.Chart?.getChart?.(weeklyActivityCtx);
        if (existing) {
          existing.destroy();
        }
        const weeklyActivityChart = new window.Chart(weeklyActivityCtx, {
          type: "bar",
          data: {
            labels: weeklyPoints.map((row) => row.label),
            datasets: [
              {
                label: "Points",
                data: weeklyPoints.map((row) => row.value),
                backgroundColor: "#4e79a7",
                borderColor: "#4e79a7",
                borderWidth: 1.5,
                borderRadius: 10,
                maxBarThickness: 22
              },
              {
                type: "line",
                label: "Hours",
                data: weeklyHours.map((row) => row.value),
                borderColor: "#f28e2b",
                backgroundColor: "#f28e2b",
                fill: false,
                tension: 0.35,
                pointRadius: 3,
                pointHoverRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 220
            },
            interaction: {
              mode: "index",
              intersect: false
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 7
                }
              },
              y: {
                position: "left",
                grid: { color: "#ddd" },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 4
                },
                beginAtZero: true
              },
              y1: {
                position: "right",
                grid: { drawOnChartArea: false },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 4
                },
                beginAtZero: true
              }
            }
          }
        });
      }

      // Render cumulative chart
      const cumulativeCtx = document.getElementById("reportStudentCumulativeChart");
      if (cumulativeCtx) {
        const existing = window.Chart?.getChart?.(cumulativeCtx);
        if (existing) {
          existing.destroy();
        }
        const cumulativeChart = new window.Chart(cumulativeCtx, {
          type: "line",
          data: {
            labels: cumulative.map((row) => row.label),
            datasets: [
              {
                label: "Cumulative Points",
                data: cumulative.map((row) => row.points),
                borderColor: "#4e79a7",
                backgroundColor: "rgba(78, 121, 167, 0.2)",
                fill: true,
                tension: 0.3,
                pointRadius: 3
              },
              {
                label: "Cumulative Hours",
                data: cumulative.map((row) => row.hours),
                borderColor: "#f28e2b",
                backgroundColor: "rgba(242, 142, 43, 0.2)",
                fill: false,
                tension: 0.3,
                pointRadius: 3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 220
            },
            interaction: {
              mode: "index",
              intersect: false
            },
            scales: {
              x: {
                grid: { color: "#ddd" },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 6
                }
              },
              y: {
                position: "left",
                grid: { color: "#ddd" },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 5
                },
                beginAtZero: true
              },
              y1: {
                position: "right",
                grid: { drawOnChartArea: false },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 5
                },
                beginAtZero: true
              }
            }
          }
        });
      }
    }
  } else if (report.type === "cohort") {
    const charts = report.payload.charts;
    if (charts.pointsTrend && charts.hoursTrend) {
      const pointsTrend = charts.pointsTrend || [];
      const hoursTrend = charts.hoursTrend || [];

      // Render trend chart
      const trendCtx = document.getElementById("reportAdminOverviewTrendChart");
      if (trendCtx) {
        const existing = window.Chart?.getChart?.(trendCtx);
        if (existing) {
          existing.destroy();
        }
        const trendChart = new window.Chart(trendCtx, {
          type: "line",
          data: {
            labels: pointsTrend.map((row) => row.label),
            datasets: [
              {
                label: "Points",
                data: pointsTrend.map((row) => row.value),
                borderColor: "#4e79a7",
                backgroundColor: "rgba(78, 121, 167, 0.2)",
                fill: true,
                tension: 0.3,
                pointRadius: 3
              },
              {
                label: "Hours",
                data: hoursTrend.map((row) => row.value),
                borderColor: "#f28e2b",
                backgroundColor: "rgba(242, 142, 43, 0.2)",
                fill: false,
                tension: 0.3,
                pointRadius: 3
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
              duration: 220
            },
            interaction: {
              mode: "index",
              intersect: false
            },
            scales: {
              x: {
                grid: { color: "#ddd" },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 6
                }
              },
              y: {
                position: "left",
                grid: { color: "#ddd" },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 5
                },
                beginAtZero: true
              },
              y1: {
                position: "right",
                grid: { drawOnChartArea: false },
                ticks: {
                  color: "#333",
                  maxTicksLimit: 5
                },
                beginAtZero: true
              }
            }
          }
        });
      }
    }
  }
}

export function validateReportData(report) {
  if (!report) {
    return { valid: false, message: "Report is null or undefined." };
  }

  if (!report.type) {
    return { valid: false, message: "Report type is missing." };
  }

  if (!report.payload) {
    return { valid: false, message: "Report payload is missing." };
  }

  if (report.type === "student") {
    if (!report.payload.student) {
      return { valid: false, message: "Student data is missing." };
    }
    if (!report.payload.charts) {
      return { valid: false, message: "Charts data is missing." };
    }
  } else if (report.type === "cohort") {
    if (!report.payload.selected) {
      return { valid: false, message: "Selected data is missing." };
    }
    if (!report.payload.charts) {
      return { valid: false, message: "Charts data is missing." };
    }
  }

  return { valid: true, message: "Report data is valid." };
}

export function createTestReport() {
  return {
    type: "student",
    generatedAt: new Date().toISOString(),
    reportTitle: "Test Student Progress Report",
    reportSubtitle: "Test Student / week",
    payload: {
      student: {
        studentId: "123456",
        studentName: "Test Student"
      },
      currentRange: "week",
      selected: {
        points: 150,
        hours: 25,
        percentile: 75,
        pointsPctOfTop: 80,
        hoursPctOfTop: 85,
        gapToTopPoints: 20,
        gapToTopHours: 5
      },
      summaries: {
        week: {
          points: 150,
          hours: 25,
          pointsPctOfTop: 80,
          hoursPctOfTop: 85
        },
        month: {
          points: 500,
          hours: 80,
          pointsPctOfTop: 75,
          hoursPctOfTop: 80
        },
        overall: {
          points: 1200,
          hours: 200,
          pointsPctOfTop: 70,
          hoursPctOfTop: 75
        }
      },
      today: {
        status: "COMPLETED",
        nextAction: "Done for today"
      },
      charts: {
        weeklyPoints: [
          { label: "Mon", value: 20 },
          { label: "Tue", value: 30 },
          { label: "Wed", value: 25 },
          { label: "Thu", value: 35 },
          { label: "Fri", value: 40 }
        ],
        weeklyHours: [
          { label: "Mon", value: 4 },
          { label: "Tue", value: 5 },
          { label: "Wed", value: 4.5 },
          { label: "Thu", value: 6 },
          { label: "Fri", value: 5.5 }
        ],
        cumulative: [
          { label: "Week 1", points: 50, hours: 10 },
          { label: "Week 2", points: 100, hours: 20 },
          { label: "Week 3", points: 150, hours: 25 }
        ]
      },
      recentShifts: [
        { localDate: "2024-01-01", site: "Site A", status: "COMPLETE", hoursDecimal: 5.5, totalPoints: 40 },
        { localDate: "2024-01-02", site: "Site B", status: "COMPLETE", hoursDecimal: 6, totalPoints: 45 }
      ],
      exceptions: []
    }
  };
}

export function openBrowserPrint() {
  window.requestAnimationFrame(() => {
    window.print();
  });
}

const UNSUPPORTED_COLOR_FUNCTION_RE = /\b(color-mix|oklab|oklch|lab|lch|hwb|color)\s*\(/i;

function fallbackColorForProperty(propertyName) {
  const name = String(propertyName || "").toLowerCase();
  if (name.includes("shadow")) {
    return "none";
  }
  if (name.includes("background")) {
    return "#ffffff";
  }
  if (name.includes("border") || name.includes("outline")) {
    return "#d8dee9";
  }
  if (name.includes("color") || name.includes("fill") || name.includes("stroke")) {
    return "#10131b";
  }
  return null;
}

function sanitizeStyleDeclarationColors(style) {
  if (!style) return;
  const properties = Array.from(style);
  properties.forEach((propertyName) => {
    const value = style.getPropertyValue(propertyName);
    if (!UNSUPPORTED_COLOR_FUNCTION_RE.test(value)) {
      return;
    }
    const fallback = fallbackColorForProperty(propertyName);
    if (fallback === null) {
      style.removeProperty(propertyName);
      return;
    }
    style.setProperty(propertyName, fallback, style.getPropertyPriority(propertyName));
  });
}

function sanitizeStyleRuleColors(rule) {
  if (!rule) return;
  if (rule.cssRules && rule.cssRules.length) {
    Array.from(rule.cssRules).forEach((childRule) => sanitizeStyleRuleColors(childRule));
    return;
  }
  if (rule.style) {
    sanitizeStyleDeclarationColors(rule.style);
  }
}

function sanitizeUnsupportedColorsInClone(clonedDocument) {
  if (!clonedDocument) return;
  Array.from(clonedDocument.styleSheets || []).forEach((sheet) => {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch (_error) {
      rules = null;
    }
    if (!rules) return;
    Array.from(rules).forEach((rule) => sanitizeStyleRuleColors(rule));
  });
  clonedDocument.querySelectorAll("[style]").forEach((element) => {
    sanitizeStyleDeclarationColors(element.style);
  });
}

function replaceCloneCanvasesWithImages(sourceRoot, clonedDocument) {
  if (!sourceRoot || !clonedDocument) return;
  const sourceCanvases = Array.from(sourceRoot.querySelectorAll("canvas"));
  const clonedCanvases = Array.from(clonedDocument.querySelectorAll("canvas"));
  clonedCanvases.forEach((cloneCanvas, index) => {
    const sourceCanvas = sourceCanvases[index];
    if (!sourceCanvas || !cloneCanvas || !cloneCanvas.parentNode) {
      return;
    }
    let imageData = "";
    try {
      imageData = sourceCanvas.toDataURL("image/png");
    } catch (_error) {
      imageData = "";
    }
    if (!imageData) {
      return;
    }
    const replacementImage = clonedDocument.createElement("img");
    replacementImage.src = imageData;
    replacementImage.alt = "Report chart image";
    replacementImage.style.display = "block";
    replacementImage.style.width = "100%";
    replacementImage.style.height = "100%";
    replacementImage.style.objectFit = "contain";
    cloneCanvas.parentNode.replaceChild(replacementImage, cloneCanvas);
  });
}

export async function downloadReportPdf(reportElement, filename) {
  if (!reportElement) {
    throw new Error("Report preview is not ready.");
  }

  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    throw new Error("PDF libraries are unavailable. Reload the app and try again.");
  }

  const captureWidth = Math.max(reportElement.scrollWidth, reportElement.clientWidth, 1);
  const canvas = await window.html2canvas(reportElement, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: captureWidth,
    onclone: (clonedDocument) => {
      const clonedBody = clonedDocument.body;
      if (clonedBody) {
        clonedBody.style.background = "#ffffff";
        clonedBody.style.color = "#10131b";
      }
      const clonedReportStage = clonedDocument.getElementById("reportStage");
      if (clonedReportStage) {
        clonedReportStage.style.background = "#ffffff";
        clonedReportStage.style.color = "#10131b";
      }
      replaceCloneCanvasesWithImages(reportElement, clonedDocument);
      sanitizeUnsupportedColorsInClone(clonedDocument);
    }
  });

  const pdf = new window.jspdf.jsPDF("p", "pt", "letter");
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pdfWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const imageData = canvas.toDataURL("image/png");

  let remainingHeight = imageHeight;
  let position = 0;

  pdf.addImage(imageData, "PNG", 0, position, imageWidth, imageHeight);
  remainingHeight -= pdfHeight;

  while (remainingHeight > 0) {
    position -= pdfHeight;
    pdf.addPage();
    pdf.addImage(imageData, "PNG", 0, position, imageWidth, imageHeight);
    remainingHeight -= pdfHeight;
  }

  pdf.save(filename);
}
