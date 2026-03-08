import { CHART_COLORS } from "./config.js";

const registry = new Map();

function getCanvas(id) {
  return document.getElementById(id);
}

function setChartFallback(canvas, message) {
  if (!canvas || !canvas.parentElement) return;
  let fallback = canvas.parentElement.querySelector(".chart-fallback");
  if (!fallback) {
    fallback = document.createElement("div");
    fallback.className = "empty-copy chart-fallback";
    canvas.parentElement.appendChild(fallback);
  }
  fallback.textContent = message;
  canvas.style.display = "none";
}

function clearChartFallback(canvas) {
  if (!canvas || !canvas.parentElement) return;
  const fallback = canvas.parentElement.querySelector(".chart-fallback");
  if (fallback) {
    fallback.remove();
  }
  canvas.style.display = "";
}

function destroyChart(key) {
  const existing = registry.get(key);
  if (existing) {
    existing.destroy();
    registry.delete(key);
  }
}

function upsertChart(key, config) {
  const canvas = getCanvas(key);
  if (!canvas) return;
  if (!window.Chart) {
    setChartFallback(canvas, "Chart library unavailable. Dashboard metrics still load, but chart rendering is disabled.");
    return;
  }
  clearChartFallback(canvas);
  destroyChart(key);
  registry.set(key, new window.Chart(canvas, config));
}

function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: CHART_COLORS.text,
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8
        }
      },
      tooltip: {
        backgroundColor: "rgba(12, 16, 24, 0.96)",
        borderColor: "rgba(255, 255, 255, 0.08)",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d8deef"
      }
    },
    scales: {
      x: {
        grid: { color: CHART_COLORS.grid },
        ticks: { color: CHART_COLORS.text }
      },
      y: {
        grid: { color: CHART_COLORS.grid },
        ticks: { color: CHART_COLORS.text }
      }
    }
  };
}

export function renderStudentCharts(dashboard) {
  if (!dashboard || !dashboard.charts) return;
  const weeklyPoints = dashboard.charts.weeklyPoints || [];
  const weeklyHours = dashboard.charts.weeklyHours || [];
  const cumulative = dashboard.charts.cumulative || [];

  upsertChart("studentWeeklyPointsChart", {
    type: "bar",
    data: {
      labels: weeklyPoints.map((row) => row.label),
      datasets: [{
        label: "Points",
        data: weeklyPoints.map((row) => row.value),
        backgroundColor: CHART_COLORS.brandSoft,
        borderColor: CHART_COLORS.brand,
        borderWidth: 1.5,
        borderRadius: 10
      }]
    },
    options: baseOptions()
  });

  upsertChart("studentWeeklyHoursChart", {
    type: "bar",
    data: {
      labels: weeklyHours.map((row) => row.label),
      datasets: [{
        label: "Hours",
        data: weeklyHours.map((row) => row.value),
        backgroundColor: CHART_COLORS.accentSoft,
        borderColor: CHART_COLORS.accent,
        borderWidth: 1.5,
        borderRadius: 10
      }]
    },
    options: baseOptions()
  });

  upsertChart("studentCumulativeChart", {
    type: "line",
    data: {
      labels: cumulative.map((row) => row.label),
      datasets: [
        {
          label: "Cumulative Points",
          data: cumulative.map((row) => row.points),
          borderColor: CHART_COLORS.brand,
          backgroundColor: CHART_COLORS.brandSoft,
          fill: true,
          tension: 0.3,
          pointRadius: 3
        },
        {
          label: "Cumulative Hours",
          data: cumulative.map((row) => row.hours),
          borderColor: CHART_COLORS.accent,
          backgroundColor: CHART_COLORS.accentSoft,
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      ...baseOptions(),
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.text }
        },
        y: {
          position: "left",
          grid: { color: CHART_COLORS.grid },
          ticks: { color: CHART_COLORS.text }
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: CHART_COLORS.text }
        }
      }
    }
  });
}

export function renderAdminCharts(dashboard) {
  if (!dashboard || !dashboard.charts) return;
  const charts = dashboard.charts;

  upsertChart("adminPointsTrendChart", {
    type: "line",
    data: {
      labels: charts.pointsTrend.map((row) => row.label),
      datasets: [{
        label: "Points",
        data: charts.pointsTrend.map((row) => row.value),
        borderColor: CHART_COLORS.brand,
        backgroundColor: CHART_COLORS.brandSoft,
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: baseOptions()
  });

  upsertChart("adminHoursTrendChart", {
    type: "line",
    data: {
      labels: charts.hoursTrend.map((row) => row.label),
      datasets: [{
        label: "Hours",
        data: charts.hoursTrend.map((row) => row.value),
        borderColor: CHART_COLORS.accent,
        backgroundColor: CHART_COLORS.accentSoft,
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: baseOptions()
  });

  upsertChart("adminLeaderboardChart", {
    type: "bar",
    data: {
      labels: charts.leaderboard.map((row) => row.label),
      datasets: [
        {
          label: "Points",
          data: charts.leaderboard.map((row) => row.points),
          backgroundColor: CHART_COLORS.brandSoft,
          borderColor: CHART_COLORS.brand,
          borderWidth: 1.5,
          borderRadius: 10
        },
        {
          label: "Hours",
          data: charts.leaderboard.map((row) => row.hours),
          backgroundColor: CHART_COLORS.accentSoft,
          borderColor: CHART_COLORS.accent,
          borderWidth: 1.5,
          borderRadius: 10
        }
      ]
    },
    options: {
      ...baseOptions(),
      indexAxis: "y"
    }
  });

  upsertChart("adminScatterChart", {
    type: "scatter",
    data: {
      datasets: [{
        label: "Students",
        data: charts.scatter.map((row) => ({ x: row.x, y: row.y, label: row.label })),
        backgroundColor: CHART_COLORS.info,
        borderColor: CHART_COLORS.info,
        pointRadius: 6,
        pointHoverRadius: 8
      }]
    },
    options: {
      ...baseOptions(),
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: {
            label(context) {
              const raw = context.raw || {};
              return `${raw.label || "Student"}: ${raw.y} pts / ${raw.x} hrs`;
            }
          }
        }
      }
    }
  });

  upsertChart("adminSiteBreakdownChart", {
    type: "bar",
    data: {
      labels: charts.siteBreakdown.map((row) => row.site),
      datasets: [
        {
          label: "Points",
          data: charts.siteBreakdown.map((row) => row.points),
          backgroundColor: CHART_COLORS.brandSoft,
          borderColor: CHART_COLORS.brand,
          borderWidth: 1.5,
          borderRadius: 10
        },
        {
          label: "Hours",
          data: charts.siteBreakdown.map((row) => row.hours),
          backgroundColor: CHART_COLORS.accentSoft,
          borderColor: CHART_COLORS.accent,
          borderWidth: 1.5,
          borderRadius: 10
        }
      ]
    },
    options: baseOptions()
  });

  upsertChart("adminExceptionChart", {
    type: "doughnut",
    data: {
      labels: charts.exceptionBreakdown.map((row) => row.label),
      datasets: [{
        data: charts.exceptionBreakdown.map((row) => row.value),
        backgroundColor: [CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: baseOptions().plugins
    }
  });
}

export function renderDetailCharts(detail) {
  if (!detail || !detail.charts) return;
  const weeklyPoints = detail.charts.weeklyPoints || [];
  const cumulative = detail.charts.cumulative || [];

  upsertChart("detailWeeklyPointsChart", {
    type: "bar",
    data: {
      labels: weeklyPoints.map((row) => row.label),
      datasets: [{
        label: "Points",
        data: weeklyPoints.map((row) => row.value),
        backgroundColor: CHART_COLORS.brandSoft,
        borderColor: CHART_COLORS.brand,
        borderWidth: 1.5,
        borderRadius: 10
      }]
    },
    options: baseOptions()
  });

  upsertChart("detailCumulativeChart", {
    type: "line",
    data: {
      labels: cumulative.map((row) => row.label),
      datasets: [{
        label: "Cumulative Points",
        data: cumulative.map((row) => row.points),
        borderColor: CHART_COLORS.brand,
        backgroundColor: CHART_COLORS.brandSoft,
        fill: true,
        tension: 0.3,
        pointRadius: 3
      }]
    },
    options: baseOptions()
  });
}

export function destroyAllCharts() {
  Array.from(registry.keys()).forEach((key) => destroyChart(key));
}
