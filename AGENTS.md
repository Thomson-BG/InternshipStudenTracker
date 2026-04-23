# Repository Guidelines

## Project Structure & Module Organization
- Frontend entrypoint: `index.html`.
- UI logic lives in `assets/js/`:
  - `app.js` (state + interaction wiring)
  - `api.js` (client API calls)
  - `charts.js` (Chart.js rendering)
  - `state.js`, `config.js`, `utils.js`
- Styles: `assets/styles/main.css`.
- Backend (Vercel serverless): `api/` with shared helpers in `api/_lib/`.
- Data/ops scripts: `scripts/` (schema init, migration tasks).
- Legacy Apps Script reference: `apps-script/` and `legacy_reference/`.
- Tests: `tests/` (Playwright specs).

## Build, Test, and Development Commands
- `npm install` — install dependencies.
- `npm run dev` — run local dev server on `127.0.0.1:4173`.
- `npm run build` — production build via Vite.
- `npm run preview` or `npm start` — preview built app locally.
- `npm test` or `npm run smoke:local` — Playwright smoke tests against local preview.
- `npm run smoke:live` — smoke tests against production URL.
- `npm run test:full` — full regression Playwright suite.
- `npm run db:init` — create/update Neon schema.
- `npm run db:migrate:sheet` — migrate sheet-era data into Neon.

## Coding Style & Naming Conventions
- JavaScript/CSS use 2-space indentation and semicolons.
- Prefer `const`/`let`; avoid `var`.
- Naming:
  - functions/variables: `camelCase`
  - constants: `UPPER_SNAKE_CASE`
  - files: lowercase (`app.js`, `main.css`)
- Keep DOM IDs descriptive and stable (e.g., `adminOpenRecordsButton`).
- No dedicated formatter/linter is configured; follow surrounding style exactly.

## Testing Guidelines
- Framework: Playwright (`@playwright/test`).
- Test files: `tests/*.spec.js`.
- Add/adjust smoke coverage for any user-facing flow changes (clock in/out, admin dashboard, student records).
- Run `npm run build` before submitting changes; run at least local smoke tests for UI/API changes.

## Commit & Pull Request Guidelines
- Commit style in history is imperative and concise (e.g., `Fix ...`, `Add ...`, `Refine ...`).
- Keep commits focused by concern (UI, API, data migration, deployment).
- PRs should include:
  - clear summary of behavior changes,
  - affected areas/files,
  - validation steps run (`build`, smoke/full tests),
  - screenshots/GIFs for UI changes (admin/dashboard/detail drawer).

## Security & Configuration Tips
- Do not commit secrets. Use `.env`/Vercel env vars for credentials.
- Validate backend changes against production-like envs (Neon + Vercel) before release.
