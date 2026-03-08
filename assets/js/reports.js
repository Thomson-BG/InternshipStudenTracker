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
  const recentShifts = payload.recentShifts || [];
  const exceptions = payload.exceptions || [];

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

      <section class="report-card" style="grid-column: span 8;">
        <div class="report-kicker">Recent Shifts</div>
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
            ${(recentShifts.length ? recentShifts : [{ localDate: "-", site: "No shifts yet", status: "-", hoursDecimal: 0, totalPoints: 0 }]).map((row) => `
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

export function openBrowserPrint() {
  window.print();
}

export async function downloadReportPdf(reportElement, filename) {
  if (!reportElement) {
    throw new Error("Report preview is not ready.");
  }

  if (!window.html2canvas || !window.jspdf?.jsPDF) {
    throw new Error("PDF libraries are unavailable. Reload the app and try again.");
  }

  const canvas = await window.html2canvas(reportElement, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true
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
