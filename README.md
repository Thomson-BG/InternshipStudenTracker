# Intern Track v2

Intern Track v2 is a static frontend with a Neon PostgreSQL backend exposed through REST API routes under `api/v1`.

## Runtime Architecture

- `index.html` - app shell for `Student Clock`, `My Progress`, and `Admin Dashboard`
- `assets/js/config.js` - API base URL and frontend constants
- `assets/js/api.js` - REST API client helpers
- `assets/js/app.js` - state, rendering, interaction flows
- `api/v1/*` - serverless API route handlers (attendance, dashboards, auth, reports)
- `server/lib/*` - backend services (rules, auth, analytics, DB access)
- `server/sql/schema.sql` - Neon schema
- `server/scripts/init-db.js` - schema + seed setup script
- `server/scripts/import-sheet-json.js` - migration helper for JSON exports
- `server/scripts/migrate-from-google-sheet.js` - pulls live Google Sheet CSV data into Neon
- `server/scripts/parity-check.js` - compares Apps Script payloads vs Neon payloads
- `server/dev-api.js` - local API runner for development

## Core Attendance Rules

- `Check In` = `+5` points
- `Check Out` = `+5` points
- Max `1` accepted check-in and `1` accepted check-out per student per local day
- Max `10` points per student per day
- `Check Out` requires a same-day `Check In`
- Minimum `60` minutes between accepted check-in and accepted check-out
- Timezone: `America/Los_Angeles`
- Points go-live: `2026-02-24`

## REST API

### `POST /api/v1/attendance`

Submit attendance payload:

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

### `POST /api/v1/admin/auth/login`

```json
{
  "password": "..."
}
```

Returns `{ ok, token, expiresAt }`.

### `GET /api/v1/dashboard/student?studentId=<id>&range=week|month|overall`

Returns student identity, today status, summaries, charts, recent shifts, and benchmark metrics.

### `GET /api/v1/dashboard/admin?range=week|month|overall&site=all|<site>`

Auth required via `Authorization: Bearer <token>`.

Returns KPI summaries, leaderboard, student rows, charts, exceptions, audit trail, and printable metadata.

### `GET /api/v1/reports?type=student|cohort&range=...&site=...&studentId=...`

Auth required via bearer token.

Returns structured report payload for browser print/PDF.

### Additional endpoints

- `GET /api/v1/roster`
- `GET /api/v1/admin/logs` (auth required)
- `GET /api/v1/admin/points` (auth required)
- `GET /api/v1/health`

## Database Setup

1. Set `NEON_DATABASE_URL`.
2. Run:

```bash
npm run init:db
```

This applies schema and seeds default roster/sites.

## Data Migration from Sheets

### Option A: Live import from Google Sheet (recommended)

```bash
npm run migrate:sheet
```

Environment:

- `NEON_DATABASE_URL` (required)
- `GOOGLE_SHEET_ID` (optional, defaults to current production sheet id)
- `MIGRATE_TRUNCATE` (optional, default `true`)

### Option B: Import from pre-exported JSON files

1. Export JSON files to a folder (`logs.json`, `shifts.json`, `points.json`, `audit.json`, `roster.json`).
2. Run:

```bash
npm run import:sheet-json -- ./path-to-export-folder
```

## Local Run

Run frontend + local API together:

```bash
npm run dev:full
```

Or run only API:

```bash
npm run dev:api
```

Production preview (static bundle):

```bash
npm run build
npm run preview
```

Open `http://localhost:4173/index.html`.

## Environment Variables

See `.env.example`.

Required for backend:

- `NEON_DATABASE_URL`

Optional overrides:

- `ADMIN_PASSWORD_HASH`
- `APP_TIMEZONE`
- `POINTS_GO_LIVE_DATE`
- `POINTS_PER_ACTION`
- `MIN_MINUTES_BETWEEN_IN_OUT`
- `ADMIN_SESSION_HOURS`
- `VITE_API_BASE_URL`
- `GOOGLE_SHEET_ID`
- `APPS_SCRIPT_URL`
- `ADMIN_PASSWORD`

## Parity Check (old backend vs Neon)

```bash
npm run parity:check
```

Environment:

- `NEON_DATABASE_URL` (required)
- `ADMIN_PASSWORD` (required)
- `APPS_SCRIPT_URL` (optional, defaults to prior production Apps Script URL)
- `PARITY_STUDENT_IDS` (optional, comma-separated)
- `PARITY_SITE` (optional, includes an additional site besides `all`)
