# Intern Track v2

Intern Track v2 is a static frontend plus Google Apps Script backend that uses a Google Sheet as the single source of truth for attendance, points, hours, cohort analytics, and printable reports.

## Runtime Architecture

- `index.html` - main app shell for `Student Clock`, `My Progress`, and `Admin Dashboard`
- `assets/styles/main.css` - custom visual system and responsive layout
- `assets/styles/print.css` - print-only report styling
- `assets/js/config.js` - Apps Script URL, student roster, sites, constants
- `assets/js/api.js` - backend fetch helpers
- `assets/js/charts.js` - Chart.js dashboards for student/admin analytics
- `assets/js/reports.js` - browser print and client-side PDF generation
- `assets/js/app.js` - application state, rendering, location flow, admin interactions
- `apps-script/Code.gs` - Apps Script API, rule engine, derived shifts/points, admin auth, analytics payloads
- `apps-script/appsscript.json` - Apps Script manifest
- `server/`, `client/`, `data/` - legacy Mongo/Express files kept for reference only

## Core Attendance Rules

- `Check In` = `+5` points
- `Check Out` = `+5` points
- Max `1` accepted check-in and `1` accepted check-out per student per local day
- Max `10` points per student per day
- `Check Out` requires a same-day `Check In`
- Minimum `60` minutes between accepted check-in and accepted check-out
- Timezone: `America/Los_Angeles`
- Points go-live: `2026-02-24`
- Historical raw logs stay untouched; hours are derived from valid historical pairs

## Google Sheet Tabs

### `Logs`

Existing historical order is preserved for compatibility, with new fields appended:

1. `timestampUtc`
2. `studentId`
3. `studentName`
4. `action`
5. `site`
6. `lat`
7. `lng`
8. `localDate`
9. `metadata`
10. `eventId`
11. `source`

### `Shifts`

1. `shiftId`
2. `localDate`
3. `studentId`
4. `studentName`
5. `site`
6. `checkInUtc`
7. `checkOutUtc`
8. `durationMinutes`
9. `hoursDecimal`
10. `checkInPoints`
11. `checkOutPoints`
12. `totalPoints`
13. `status`
14. `source`
15. `notes`

### `Points`

1. `studentId`
2. `studentName`
3. `baselinePoints`
4. `earnedPoints`
5. `totalPoints`
6. `lastUpdated`

### `Audit`

1. `timestampUtc`
2. `localDate`
3. `actorType`
4. `studentId`
5. `action`
6. `outcomeCode`
7. `message`
8. `site`
9. `lat`
10. `lng`
11. `metadata`

## Apps Script API

### `POST /exec`

Submit attendance payload as JSON with `Content-Type: text/plain`:

```json
{
  "studentId": "131923",
  "studentName": "Jordan Belvin",
  "action": "Check In",
  "site": "Alliance Diesel",
  "lat": 33.76,
  "lng": -116.96,
  "clientTimestamp": "2026-03-08T23:17:00.000Z"
}
```

Success response:

```json
{
  "ok": true,
  "code": "RECORDED",
  "pointsDelta": 5,
  "totalPoints": 40,
  "localDate": "2026-03-08",
  "action": "Check In"
}
```

### `POST /exec?mode=admin_auth`

```json
{
  "password": "..."
}
```

Success response:

```json
{
  "ok": true,
  "token": "...",
  "expiresAt": "2026-03-08T23:00:00.000Z"
}
```

### `GET /exec?mode=student_dashboard&studentId=<id>&range=week|month|overall`

Returns:

- student identity
- today's status
- week / month / overall summaries
- selected-range benchmark metrics
- student charts
- recent shifts
- open / exception days

### `GET /exec?mode=admin_dashboard&token=<token>&range=week|month|overall&site=all|<site>`

Returns:

- KPI summaries
- leaderboard and student rows
- chart datasets
- exception list
- audit trail
- recent shifts
- printable cohort metadata

### `GET /exec?mode=report_data&token=<token>&type=student|cohort&range=week|month|overall&site=all|<site>&studentId=<id>`

Returns structured report payloads for:

- browser print
- client-side PDF export

### Compatibility / debug endpoints

These now require an admin token as well:

- `GET /exec?mode=logs&token=<token>`
- `GET /exec?mode=points&token=<token>`

## Frontend Features

### Student Clock

- geofenced site validation
- one-tap check-in / check-out
- today status card
- next-action guidance
- local device history
- inactivity reset after `90` seconds

### My Progress

- week / month / overall switching
- points and hours totals
- points % of top student
- hours % of top student
- percentile badge without named leaderboard exposure
- weekly charts, cumulative trend, heatmap, recent shifts, open / exception list

### Admin Dashboard

- password-based sign-in with 8-hour session token
- range and site filters
- KPI strip
- cohort charts
- student analysis table
- exception list and audit trail
- student drill-down drawer
- browser print, PDF, and CSV export

## Local Run

```bash
npm start
```

Then open:

- `http://localhost:4173/index.html`

## Deployment Checklist

1. Copy `apps-script/Code.gs` and `apps-script/appsscript.json` into your Apps Script project.
2. Confirm the script has access to spreadsheet `1Dd4qJ3SkARcigi-kmM9wCUc9NkRqpQoEkFVri7_FKlY`.
3. Deploy as a web app:
   - Execute as: `Me`
   - Who has access: `Anyone` (or your preferred policy)
4. Update `APPS_SCRIPT_URL` in `assets/js/config.js` if the deployment URL changes.
5. If you want a different admin password, set `ADMIN_PASSWORD_HASH` in Apps Script `Script Properties`.
6. In the Apps Script editor, run `rebuildDerivedSheetsNow()` once after deploy to force-refresh `Shifts`/`Points` from `Logs` and verify the `+5/+5` (max `10/day`) rule integrity.
