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
    animation: {
      duration: 220
    },
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: CHART_COLORS.text,
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 14
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
        ticks: {
          color: CHART_COLORS.text,
          maxTicksLimit: 6
        }
      },
      y: {
        grid: { color: CHART_COLORS.grid },
        ticks: {
          color: CHART_COLORS.text,
          maxTicksLimit: 5
        },
        beginAtZero: true
      }
    }
  };
}

export function renderStudentCharts(dashboard) {
  if (!dashboard || !dashboard.charts) return;
  const weeklyPoints = dashboard.charts.weeklyPoints || [];
  const weeklyHours = dashboard.charts.weeklyHours || [];
  const cumulative = dashboard.charts.cumulative || [];

  destroyChart("studentWeeklyPointsChart");
  destroyChart("studentWeeklyHoursChart");

  upsertChart("studentWeeklyActivityChart", {
    type: "bar",
    data: {
      labels: weeklyPoints.map((row) => row.label),
      datasets: [
        {
          label: "Points",
          data: weeklyPoints.map((row) => row.value),
          backgroundColor: CHART_COLORS.brandSoft,
          borderColor: CHART_COLORS.brand,
          borderWidth: 1.5,
          borderRadius: 10,
          maxBarThickness: 22
        },
        {
          type: "line",
          label: "Hours",
          data: weeklyHours.map((row) => row.value),
          borderColor: CHART_COLORS.accent,
          backgroundColor: CHART_COLORS.accentSoft,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          pointHoverRadius: 4,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      ...baseOptions(),
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 7
          }
        },
        y: {
          position: "left",
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 4
          },
          beginAtZero: true
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 4
          },
          beginAtZero: true
        }
      }
    },
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
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 6
          }
        },
        y: {
          position: "left",
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        }
      }
    }
  });
}

export function renderAdminCharts(dashboard) {
  if (!dashboard || !dashboard.charts) return;
  const charts = dashboard.charts;

  destroyChart("adminPointsTrendChart");
  destroyChart("adminHoursTrendChart");

  upsertChart("adminOverviewTrendChart", {
    type: "line",
    data: {
      labels: charts.pointsTrend.map((row) => row.label),
      datasets: [
        {
          label: "Points",
          data: charts.pointsTrend.map((row) => row.value),
          borderColor: CHART_COLORS.brand,
          backgroundColor: CHART_COLORS.brandSoft,
          fill: true,
          tension: 0.3,
          pointRadius: 3
        },
        {
          label: "Hours",
          data: charts.hoursTrend.map((row) => row.value),
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
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 6
          }
        },
        y: {
          position: "left",
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        }
      }
    },
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
      indexAxis: "y",
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.text
          }
        }
      }
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
  const weeklyHours = detail.charts.weeklyHours || [];
  const cumulative = detail.charts.cumulative || [];
  const recentShifts = Array.isArray(detail.recentShifts) ? detail.recentShifts : [];
  const exceptions = Array.isArray(detail.exceptions) ? detail.exceptions : [];
  const recentActivity = recentShifts.slice(0, 8).reverse();

  // Clean up legacy chart ids after switching detail layout.
  destroyChart("detailWeeklyPointsChart");

  upsertChart("detailRecentActivityChart", {
    type: "bar",
    data: {
      labels: recentActivity.map((row) => row.localDate || "—"),
      datasets: [
        {
          label: "Points",
          data: recentActivity.map((row) => Number(row.totalPoints || 0)),
          backgroundColor: CHART_COLORS.brandSoft,
          borderColor: CHART_COLORS.brand,
          borderWidth: 1.5,
          borderRadius: 8,
          maxBarThickness: 18
        },
        {
          label: "Hours",
          data: recentActivity.map((row) => Number(row.hoursDecimal || 0)),
          backgroundColor: CHART_COLORS.accentSoft,
          borderColor: CHART_COLORS.accent,
          borderWidth: 1.5,
          borderRadius: 8,
          maxBarThickness: 18
        }
      ]
    },
    options: {
      ...baseOptions(),
      indexAxis: "y",
      plugins: {
        ...baseOptions().plugins,
        tooltip: {
          ...baseOptions().plugins.tooltip,
          callbacks: {
            title(items) {
              const index = items?.[0]?.dataIndex ?? 0;
              const row = recentActivity[index];
              if (!row) {
                return "Recent activity";
              }
              return `${row.localDate || "—"} · ${row.site || "Unknown site"}`;
            },
            label(context) {
              const row = recentActivity[context.dataIndex] || {};
              const label = context.dataset.label || "Value";
              const value = Number(context.raw || 0);
              const formatted = label === "Hours" ? value.toFixed(2) : value.toFixed(1);
              return `${label}: ${formatted}${label === "Hours" ? " hrs" : " pts"}`;
            },
            afterBody(items) {
              const index = items?.[0]?.dataIndex ?? 0;
              const row = recentActivity[index];
              if (!row) {
                return [];
              }
              return [`Status: ${String(row.status || "UNKNOWN").replace(/_/g, " ")}`];
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 8
          }
        }
      }
    }
  });

  upsertChart("detailWeeklyComboChart", {
    type: "bar",
    data: {
      labels: weeklyPoints.map((row) => row.label),
      datasets: [
        {
          label: "Points",
          data: weeklyPoints.map((row) => row.value),
          backgroundColor: CHART_COLORS.brandSoft,
          borderColor: CHART_COLORS.brand,
          borderWidth: 1.5,
          borderRadius: 10,
          maxBarThickness: 26
        },
        {
          type: "line",
          label: "Hours",
          data: weeklyHours.map((row) => row.value),
          borderColor: CHART_COLORS.accent,
          backgroundColor: CHART_COLORS.accentSoft,
          fill: false,
          tension: 0.32,
          pointRadius: 3,
          pointHoverRadius: 4,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      ...baseOptions(),
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 7
          }
        },
        y: {
          position: "left",
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        }
      }
    }
  });

  upsertChart("detailCumulativeChart", {
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
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 6
          }
        },
        y: {
          position: "left",
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        }
      }
    }
  });

  const siteRows = Object.entries(recentShifts.reduce((acc, shift) => {
    const site = String(shift?.site || "Unknown site");
    if (!acc[site]) {
      acc[site] = { points: 0, hours: 0 };
    }
    acc[site].points += Number(shift?.totalPoints || 0);
    acc[site].hours += Number(shift?.hoursDecimal || 0);
    return acc;
  }, {}))
    .map(([site, value]) => ({ site, points: value.points, hours: value.hours }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 6);

  const siteLabels = siteRows.length ? siteRows.map((row) => row.site) : ["No site data"];
  const sitePoints = siteRows.length ? siteRows.map((row) => row.points) : [0];
  const siteHours = siteRows.length ? siteRows.map((row) => row.hours) : [0];

  upsertChart("detailSiteBreakdownChart", {
    type: "bar",
    data: {
      labels: siteLabels,
      datasets: [
        {
          label: "Points",
          data: sitePoints,
          backgroundColor: CHART_COLORS.brandSoft,
          borderColor: CHART_COLORS.brand,
          borderWidth: 1.5,
          borderRadius: 8
        },
        {
          label: "Hours",
          data: siteHours,
          backgroundColor: CHART_COLORS.accentSoft,
          borderColor: CHART_COLORS.accent,
          borderWidth: 1.5,
          borderRadius: 8
        }
      ]
    },
    options: {
      ...baseOptions(),
      indexAxis: "y",
      scales: {
        x: {
          grid: { color: CHART_COLORS.grid },
          ticks: {
            color: CHART_COLORS.text,
            maxTicksLimit: 5
          },
          beginAtZero: true
        },
        y: {
          grid: { display: false },
          ticks: {
            color: CHART_COLORS.text
          }
        }
      }
    }
  });

  const statusCounts = recentShifts.reduce((acc, shift) => {
    const status = String(shift?.status || "").toUpperCase();
    if (["COMPLETE", "BACKFILLED_COMPLETE", "COMPLETED"].includes(status)) {
      acc.complete += 1;
    } else if (["OPEN", "CHECKED_IN"].includes(status)) {
      acc.open += 1;
    } else if (status === "EXCEPTION") {
      acc.exception += 1;
    }
    return acc;
  }, { complete: 0, open: 0, exception: 0 });

  if (exceptions.length) {
    statusCounts.exception = Math.max(statusCounts.exception, exceptions.length);
  }

  upsertChart("detailStatusMixChart", {
    type: "doughnut",
    data: {
      labels: ["Complete", "Open", "Exception"],
      datasets: [{
        data: [statusCounts.complete, statusCounts.open, statusCounts.exception],
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

export function destroyAllCharts() {
  Array.from(registry.keys()).forEach((key) => destroyChart(key));
}
