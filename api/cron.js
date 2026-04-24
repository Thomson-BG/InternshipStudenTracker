const { CONFIG } = require("./_lib/config");
const { formatLocalDate } = require("./_lib/utils");
const { appendAudit, getSql, listOpenShiftsForDate, upsertPointsForStudent, upsertShift } = require("./_lib/db");

function buildAutoCheckoutUtc(localDate) {
  const h = CONFIG.autoCheckoutHour;
  const m = CONFIG.autoCheckoutMinute;
  // Try PDT (UTC-7) then PST (UTC-8) — pick whichever maps back to localDate in Pacific time
  for (const offsetHours of [7, 8]) {
    const utcHour = h + offsetHours;
    const dayBump = utcHour >= 24 ? 1 : 0;
    const [yr, mo, dy] = localDate.split("-").map(Number);
    const candidate = new Date(Date.UTC(yr, mo - 1, dy + dayBump, utcHour % 24, m, 0));
    if (formatLocalDate(candidate, CONFIG.timezone) === localDate) {
      return candidate;
    }
  }
  // Fallback: assume PDT (UTC-7)
  const [yr, mo, dy] = localDate.split("-").map(Number);
  return new Date(Date.UTC(yr, mo - 1, dy, h + 7, m, 0));
}

module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sql = getSql();
    const today = formatLocalDate(new Date(), CONFIG.timezone);
    const autoCheckoutDate = buildAutoCheckoutUtc(today);
    const openShifts = await listOpenShiftsForDate(sql, today);

    let processed = 0;
    for (const shift of openShifts) {
      if (!shift.checkInUtc) {
        continue;
      }
      const checkInDate = new Date(shift.checkInUtc);
      if (checkInDate >= autoCheckoutDate) {
        continue;
      }
      const durationMinutes = Math.max(0, Math.round((autoCheckoutDate.getTime() - checkInDate.getTime()) / 60000));
      const hoursDecimal = Math.round((durationMinutes / 60) * 100) / 100;
      const updatedShift = {
        ...shift,
        checkOutUtc: autoCheckoutDate.toISOString(),
        durationMinutes,
        hoursDecimal,
        checkOutPoints: 0,
        totalPoints: Number(shift.checkInPoints || 0),
        status: "FAILED_TO_CHECKOUT",
        source: "system"
      };
      await upsertShift(sql, updatedShift);
      await upsertPointsForStudent(sql, shift.studentId, shift.studentName);
      await appendAudit(sql, {
        actorType: "SYSTEM",
        studentId: shift.studentId,
        action: "Auto Checkout",
        outcomeCode: "FAILED_TO_CHECKOUT",
        message: `Auto-checked out at ${autoCheckoutDate.toISOString()}. Student did not check out by 5:30 PM PDT.`,
        site: shift.site,
        metadata: { shiftId: shift.shiftId, autoCheckoutUtc: autoCheckoutDate.toISOString() }
      });
      processed++;
    }

    return res.status(200).json({ ok: true, processed, date: today });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
};
