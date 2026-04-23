# Intern Track — User Guide

Intern Track is used to log internship attendance, verify location, and review student progress for both interns and admins.

## What This App Does
- Records **Check-In** and **Check-Out** events.
- Verifies attendance by location.
- Shows student history and performance.
- Gives admins a full dashboard with records, charts, exports, and audit visibility.

---

## Student Workflow

### 1) Dashboard tab (Clock In/Out)
1. Enter your 6-digit Student ID.
2. Confirm your name appears.
3. Wait for location verification.
4. Tap **Check-In** at arrival.
5. Tap **Check-Out** when leaving.

### Dashboard Features
- **Student ID lookup**: confirms active student.
- **Check-In / Check-Out buttons**: attendance actions.
- **Current Status panel**: shows next action and shift timer.
- **Location Verification map**: displays live GPS and matched site.
- **Site selector**: appears if multiple nearby sites are detected.
- **My Stats button**: opens quick stats modal.
- **Reset Session**: clears current student session.

### Important Behavior
- Location permission is required for attendance actions.
- If session is idle for privacy, you may need to re-enter your ID.
- If rules are not met (for example, invalid timing/order), the app shows a clear message.

---

## Student History tab
Use this tab to review recent performance after loading a student.

### Features
- **Week points and hours** summary cards.
- **Last 7 days list** with check-in/check-out activity.
- **View Stats** modal with:
  - Today status
  - Week / Month / Overall points and hours
  - Today’s shift details

---

## Admin Workflow

### 1) Sign in
- Open **Admin** tab.
- Enter admin password.
- Use **Sign Out** when done.

### 2) Student Records section
Tap **Open Student Records** to access full record history.

#### Filters available
- Start Date / End Date
- Intern Name or ID
- Site
- Location map completeness (check-in/check-out map availability)

#### Records tools
- **Apply Filters** / **Reset**
- Paginated table
- Mini maps for check-in and check-out locations

### 3) Filters & Tools (Dashboard scope)
- Range: Week / Month / Overall
- Site filter
- Status filter
- Search (name/ID)
- **Intern Insights** lookup + **Open Insights**
- Actions: **Refresh**, **Print**, **PDF**, **CSV**

### 4) Admin analytics panels
- **Cohort Health** KPI cards
- **Today’s Student Activity** table
- Charts:
  - Cohort Trend
  - Leaderboard
  - Points vs Hours
  - Status Mix
  - Sites Breakdown
  - Attendance Heatmap

### 5) Student Analysis & Detail drawer
- Click any student name (or use Intern Insights) to open detailed intern analytics.
- Detail view includes:
  - Expanded summary cards
  - Insight chips (last site, top site, recent hours)
  - Weekly Activity chart
  - Cumulative Trend chart
  - Site Performance chart
  - Status Distribution chart
  - Recent shifts table
  - Exceptions list
  - Student report print/PDF shortcuts

---

## Reports & Exports
- **Print**: browser print view for reporting.
- **PDF**: generates downloadable report snapshots.
- **CSV**: exports student analysis rows for spreadsheet use.

---

## Visual/Usability Notes
- Theme toggle supports light/dark viewing.
- Motion effects are subtle and optimized for readability.
- Reduced-motion device preferences are respected.

---

## Troubleshooting
- If data looks stale, use **Refresh** in Admin.
- If check-in/check-out is unavailable, confirm GPS permission and site match.
- If charts do not appear after an update, perform a hard refresh.

For contributor/developer standards, see `AGENTS.md`.
