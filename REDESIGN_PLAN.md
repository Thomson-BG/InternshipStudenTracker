# InternTrack — iOS Redesign & Simplification Plan
**Prepared for Josh Thomson | March 8, 2026**

---

## 1. CURRENT STATE ANALYSIS

### What the app does right now
InternTrack v2 is a static frontend + Google Apps Script backend using a Google Sheet as the source of truth. It has three tabs:

- **Clock** — Student enters a 6-digit ID, GPS geofences them to a site, and they tap Check In / Check Out
- **Progress** — Student sees their Week/Month/Overall stats, benchmark gauges vs the cohort, charts, heatmap, recent shifts, exceptions
- **Admin** — Password-protected dashboard with full cohort analytics, student analysis table, advanced charts, audit trail, and Google Sheet link

### Visual appearance (current)
- **Dark mode by default** — pure black (#000000) with deep gray glassmorphism cards
- Radial gradient background with blue glow at top
- Custom "InternTrack" header with theme toggle
- Three-column tab bar: Clock · Progress · Admin
- Student-facing Performance Snapshot shows: "Overall Pts", "Overall Hrs", "Pts vs Top", "Hrs vs Top" — all comparison metrics that are unnecessary and potentially anxiety-inducing for interns
- Progress view has complex charts, benchmark gauges, heatmaps, cumulative trend lines
- The Google Sheet link is already behind admin auth — correctly scoped

### Key technical facts
- Single `index.html` file with modular ES module JS split across `assets/js/`
- Backend: `Code.gs` (Google Apps Script) — **NO backend changes needed**
- The student_dashboard API with `?range=week` already returns all the data we need (weekly pts, hours, recent shifts)
- The app prefetches all 3 ranges (week/month/overall) — we can simplify to only fetch `week`
- Font stack is already `SF Pro / -apple-system` — correct

---

## 2. WHAT NEEDS TO CHANGE

### A. Student Data Reduction (Non-Negotiable Requirements)
Students should ONLY see:
1. Their check-in/check-out entries from the **past 7 days** (one list per day)
2. **Total points for the current week** (single large number)
3. **Total hours for the current week** (single large number)

**Remove from student-facing views:**
- Overall points and hours stats
- Month stats
- "Pts vs Top" and "Hrs vs Top" comparison metrics
- Benchmark gauges (doughnut charts showing % of top student)
- Weekly Activity chart (bar chart)
- Cumulative Progress chart (line chart)
- Shift Heatmap (GitHub-style calendar)
- "Days Needing Attention" / exceptions list
- "Performance Snapshot" quick stats card (4 stat boxes)
- "Scoring Rules" collapsible card
- "Local Device History" collapsible card
- The Week/Month/Overall range segment control on Progress tab
- "Full Progress" link button (currently on Clock view)
- Percentile badge ("Ahead of 84% of cohort")

**Keep for students:**
- Student ID input
- GPS location detection and geofencing
- Check In / Check Out action buttons
- Today's status headline ("Checked in at 2:10 PM")
- This week's points + hours (large numbers only)
- The last 7 days of check-in/check-out entries (simple list)
- Toast notifications for success/error feedback

### B. Admin-Only Google Sheet Access
The Google Sheet link is currently inside `adminContent` which requires password auth — this is already correct. We need to confirm the link does NOT appear anywhere outside the admin section. It does not. No change needed to the logic, but we should make the button more prominent in admin.

### C. Apple iOS Design Transformation

#### Design Philosophy
The goal is to make this look like it shipped with iOS — specifically matching the design language of Apple's native apps: Clock, Health, Activity, Reminders. Clean, purposeful, no decoration for decoration's sake.

#### Color System (Light Mode Default)
| Token | Light Mode | Dark Mode |
|-------|-----------|-----------|
| System Background | `#F2F2F7` | `#000000` |
| Secondary Background | `#FFFFFF` | `#1C1C1E` |
| Tertiary Background | `#EFEFF4` | `#2C2C2E` |
| Separator | `rgba(60,60,67,0.29)` | `rgba(84,84,88,0.65)` |
| Label (primary text) | `#000000` | `#FFFFFF` |
| Secondary Label | `rgba(60,60,67,0.6)` | `rgba(235,235,245,0.6)` |
| iOS Blue | `#007AFF` | `#0A84FF` |
| iOS Green | `#34C759` | `#30D158` |
| iOS Orange | `#FF9500` | `#FF9F0A` |
| iOS Red | `#FF3B30` | `#FF453A` |
| iOS Teal | `#5AC8FA` | `#64D2FF` |

#### Typography (iOS Text Styles)
| Style | Size | Weight | Tracking |
|-------|------|--------|----------|
| Large Title | 34pt | Bold (700) | -0.4px |
| Title 1 | 28pt | Bold (700) | -0.3px |
| Title 2 | 22pt | Bold (700) | -0.2px |
| Title 3 | 20pt | Semibold (600) | -0.15px |
| Headline | 17pt | Semibold (600) | -0.1px |
| Body | 17pt | Regular (400) | 0 |
| Callout | 16pt | Regular (400) | 0 |
| Subheadline | 15pt | Regular (400) | 0 |
| Footnote | 13pt | Regular (400) | 0 |
| Caption 1 | 12pt | Regular (400) | 0 |
| Caption 2 | 11pt | Regular (400) | +0.07px |

Big stat numbers: **56px SF Pro Display, weight 700, tracking -1px**

#### Spacing System
- Screen edge padding: **20px** (matches iOS)
- Card internal padding: **16px** horizontal, **12px** vertical
- Between cards: **8-12px**
- Touch target minimum: **44 × 44 px** (Apple HIG requirement)
- Tab bar height: **49px** + safe area

#### Key Component Redesigns

**1. Header → iOS Large Title Style**
- Remove custom "InternTrack" brand header
- Each view gets its own inline large title (like iOS Settings, Health apps)
- Title text: "Clock", "This Week", "Dashboard"
- Font: 34pt SF Pro Display Bold
- Position: top of scrollable content, collapses as user scrolls (or just stays static at top)
- Keep a thin frosted navigation bar (`rgba(242,242,247,0.85)` + backdrop blur) at top for status bar area

**2. Cards → iOS Grouped Table Style**
- Background: pure `#FFFFFF` (light) / `#1C1C1E` (dark)
- Border radius: **12px** (iOS grouped cell radius)
- Shadow: `0 1px 0 rgba(0,0,0,0.08)` top + `0 2px 8px rgba(0,0,0,0.06)` — very subtle
- No border lines around cards (shadow defines boundary)
- Section headers above card groups: ALL CAPS, 13px, secondary label color, 16px margin left (iOS grouped section header)

**3. Check In / Check Out → Large Single CTA Button**
- Replace the side-by-side two-button layout with ONE full-width primary action button
- The button reflects current state: shows "Check In" (green) or "Check Out" (blue) depending on today's status
- If both are complete: show a "Done for today ✓" non-interactive display
- Button spec: full width, 56px height, 14px border radius, 17pt Semibold white text
- Check In color: `#34C759` → `#30D158` dark
- Check Out color: `#007AFF` → `#0A84FF` dark
- Spring animation on press: scale(0.97) → back to 1.0
- Keep both buttons present in DOM (for disabled/hidden states) but only show the relevant one

**4. Student ID Input**
- Full-width iOS-style input field
- Height: 48px, 12px radius
- "6-digit Student ID" placeholder in secondary label color
- Auto-focus on number pad (`inputmode="numeric"`)
- On valid entry → smooth fade to resolved student name (already implemented)

**5. Week Stats Display (Progress tab)**
- Two side-by-side large stat boxes:
  ```
  ┌─────────────┐  ┌─────────────┐
  │   POINTS    │  │    HOURS    │
  │   ── ──     │  │   ── . ──   │
  │    pts      │  │    hrs      │
  └─────────────┘  └─────────────┘
  ```
- Numbers: 52px SF Pro Display Bold, tracking -1px
- Label: 11px ALL CAPS Caption 2, secondary label color
- Background: white card
- Matches iOS Activity app ring stats presentation

**6. 7-Day History List (Progress tab)**
- Replace all charts and tables with a simple grouped list
- Format: iOS-style grouped table cells
- Each row: Date left-aligned | Time + Status right-aligned
- Check In indicator: filled green circle (●)
- Check Out indicator: filled blue circle (●)
- No check in recorded: faded dash
- Section header above list: "LAST 7 DAYS"
- iOS separator lines between rows
- Empty state if < 7 days of data: show placeholder rows with "No activity" text

**7. Tab Bar → True iOS Style**
- Height: 49px + `env(safe-area-inset-bottom)`
- Background: `rgba(242,242,247,0.85)` + `backdrop-filter: blur(20px)`
- Border top: `1px solid rgba(0,0,0,0.12)` light / `rgba(255,255,255,0.08)` dark
- Icons: 25px, same weight as labels (thin unselected, filled selected)
- Labels: 10pt SF Pro Text
- Selected: iOS Blue `#007AFF`
- Unselected: System Gray `#8E8E93`

**8. Admin Tab — Keep All Charts, Add Sheet Button**
- All existing admin charts, KPIs, student table, audit trail — UNCHANGED functionality
- Make Google Sheet button more prominent: larger, placed at the top of admin content right below the KPI strip
- Admin tab bar icon: shield (keep current)
- Admin login card: already good, minor cleanup
- Admin filters: keep all (range, site, status, search)

---

## 3. FILES TO CHANGE

| File | Change Type | Description |
|------|-------------|-------------|
| `index.html` | Major restructure | Remove student-facing sections, restructure Clock & Progress views, rename nav labels |
| `assets/styles/main.css` | Complete redesign | Default light mode, new color tokens, iOS typography scale, new card styles, new button styles, iOS tab bar |
| `assets/js/app.js` | Simplify rendering | Remove progress chart calls, remove benchmark/comparison renders, add 7-day history render, hardcode student range to "week" |
| `assets/js/charts.js` | No change needed | Admin charts remain untouched |
| `assets/js/config.js` | Minor | Change default range, remove unused constants if any |
| `assets/js/state.js` | Minor | Default student range to "week" |
| `assets/js/api.js` | Minor | Student dashboard always fetches "week" range (simplify) |
| `assets/js/utils.js` | No change | Utility functions unchanged |
| `assets/js/reports.js` | No change | Admin reports unchanged |
| `Code.gs` | No change | Backend untouched |

---

## 4. DETAILED TO-DO LIST

### Phase 1: CSS — Default Light Mode + iOS Design Tokens
- [ ] 1.1 Change `:root` default to light mode values (swap dark as default, light as default)
- [ ] 1.2 Update `body` background to `#F2F2F7` flat color (remove radial gradient and blue glow)
- [ ] 1.3 Update `--bg`, `--bg-elevated`, `--glass`, `--glass-border` for light default
- [ ] 1.4 Add all iOS semantic color tokens (system background, secondary bg, separator, labels)
- [ ] 1.5 Add iOS light mode system accent colors: `#007AFF`, `#34C759`, `#FF3B30`, `#FF9500`
- [ ] 1.6 Add `body.theme-dark` class (instead of `body.theme-light`) — invert which is the opt-in
- [ ] 1.7 Update all `theme-light` class selectors to be the default `:root`, move current dark values to `body.theme-dark`

### Phase 2: CSS — Typography Scale
- [ ] 2.1 Add Large Title class: `.text-large-title { font-size: 34px; font-weight: 700; letter-spacing: -0.4px; }`
- [ ] 2.2 Add Title 1: `.text-title1 { font-size: 28px; font-weight: 700; }`
- [ ] 2.3 Add Title 2: `.text-title2 { font-size: 22px; font-weight: 700; }`
- [ ] 2.4 Add Headline: `.text-headline { font-size: 17px; font-weight: 600; }`
- [ ] 2.5 Add Body: `.text-body { font-size: 17px; font-weight: 400; }`
- [ ] 2.6 Add Footnote: `.text-footnote { font-size: 13px; font-weight: 400; }`
- [ ] 2.7 Add big stat number style: `.stat-big { font-size: 56px; font-weight: 700; letter-spacing: -1px; line-height: 1; }`
- [ ] 2.8 Update `.hero-title` to use Large Title style
- [ ] 2.9 Update `.section-label` to match iOS grouped section header style (13px, secondary label)

### Phase 3: CSS — Component Redesigns
- [ ] 3.1 Redesign `.glass-card` to iOS grouped card: white bg, 12px radius, subtle shadow, no border
- [ ] 3.2 Remove `backdrop-filter` blur from content cards (keep only for header + tab bar)
- [ ] 3.3 Update `.app-header` to minimal frosted style (thin, barely visible)
- [ ] 3.4 Add `.ios-section-header` style for section group labels
- [ ] 3.5 Redesign action buttons: replace `.action-btn` layout with `.action-btn-primary` (full-width, 56px, 14px radius)
- [ ] 3.6 Add `.btn-checkin` (green) and `.btn-checkout` (blue) button variants
- [ ] 3.7 Update `.ios-input` for cleaner iOS input style (white bg on light mode, gray bg on dark)
- [ ] 3.8 Redesign `.tab-bar` with proper iOS tab bar (49px + safe area, frosted, correct sizing)
- [ ] 3.9 Add `.tab-item` active state with filled icon variant
- [ ] 3.10 Add `.week-stats-grid` for the two large stat boxes layout
- [ ] 3.11 Add `.stat-box` for individual week stat display
- [ ] 3.12 Add `.history-list` iOS-style grouped list with separators
- [ ] 3.13 Add `.history-row` with check-in/out indicator dot
- [ ] 3.14 Add spring press animation: `@keyframes iosTap { from { transform: scale(0.97) } to { transform: scale(1) } }`
- [ ] 3.15 Update `.hero-card` gradient to subtle green/blue tint (not the current blue-heavy gradient)
- [ ] 3.16 Update `.status-pill` to iOS-native pill style
- [ ] 3.17 Ensure all interactive elements have minimum 44×44px touch targets
- [ ] 3.18 Add haptic-style visual feedback on button press

### Phase 4: HTML — Remove Excess Student-Facing Elements
- [ ] 4.1 Remove `.view-header-compact` from `clockView` — replace with large inline title
- [ ] 4.2 Remove the `#clockQuickStats` "Performance Snapshot" section (Overall Pts, Overall Hrs, Pts vs Top, Hrs vs Top stats grid)
- [ ] 4.3 Remove the "Scoring Rules" `<details>` collapsible card
- [ ] 4.4 Remove the "Local Device History" `<details>` collapsible card
- [ ] 4.5 Remove `#jumpToProgressButton` "Full Progress" link from Clock view
- [ ] 4.6 Remove the session info card (STUDENT / LOCATION two-column card at top of Clock view) — replace with inline student name in hero card
- [ ] 4.7 Replace two `action-btn` buttons with ONE primary action button that changes label/color based on state
- [ ] 4.8 Add a hidden secondary button for the non-active action (for JS targeting)
- [ ] 4.9 In Progress view: remove the `.segment-control` range buttons (Week/Month/Overall)
- [ ] 4.10 In Progress view: remove `#progressSummaryCards` grid (the 3-box summary with Week/Month/Overall)
- [ ] 4.11 In Progress view: remove `#gaugeGrid` "Benchmark Gauges" section
- [ ] 4.12 In Progress view: remove the `.chart-row` with `studentWeeklyActivityChart` and `studentCumulativeChart`
- [ ] 4.13 In Progress view: remove `#studentHeatmapDetails` collapsible
- [ ] 4.14 In Progress view: remove the "Days Needing Attention" exceptions collapsible
- [ ] 4.15 In Progress view: update "Recent Shifts" section → rename to "Last 7 Days", simplify to date+time+status list
- [ ] 4.16 In Progress view: remove percentile badge from student overview
- [ ] 4.17 Add a new `#weekStatsSection` with `.week-stats-grid` containing two `.stat-box` divs for `weekPoints` and `weekHours`
- [ ] 4.18 Add large title `<h1>` at top of Clock view: "Clock In"
- [ ] 4.19 Add large title `<h1>` at top of Progress view: "This Week"
- [ ] 4.20 Update tab label from "Progress" to "My Week"
- [ ] 4.21 Update Clock tab icon to a more iOS-native checkmark or location pin look
- [ ] 4.22 Rename `progressView` section label to "My Week"
- [ ] 4.23 Add `#drawerOverlay` to close drawer — already present, keep

### Phase 5: JavaScript — Simplify Student Logic
- [ ] 5.1 In `state.js`: Change default `student.range` from `"overall"` to `"week"`
- [ ] 5.2 In `app.js`: Update `loadStudentDashboard()` to always pass `range = "week"` (remove multi-range logic for student)
- [ ] 5.3 In `app.js`: Remove `primeStudentRangeCache()` call (no longer needed — only 1 range)
- [ ] 5.4 In `app.js`: Remove `setStudentRange()` function or guard it behind admin flag
- [ ] 5.5 In `app.js`: Update `renderProgressView()` — remove gauge rendering, chart rendering, heatmap rendering, exception list rendering
- [ ] 5.6 In `app.js`: Update `renderProgressView()` — add `render7DayHistory(data)` call
- [ ] 5.7 In `app.js`: Add new `render7DayHistory(dashboard)` function:
  - Loop over `dashboard.recentShifts` — filter to last 7 calendar days
  - For each day: render a list row with date + check-in time + check-out time (or "—" if missing)
  - Render into `#sevenDayHistoryList`
- [ ] 5.8 In `app.js`: Update `renderClockView()` — remove quick stats section rendering
- [ ] 5.9 In `app.js`: Update `renderClockView()` — update hero card stats to show WEEK points/hours only
- [ ] 5.10 In `app.js`: Update action button rendering — instead of enabling/disabling both buttons, show only the relevant action button (one at a time) based on today's status
- [ ] 5.11 In `app.js`: Update `renderStudentIdentity()` — integrate student name display into hero card, remove session card render calls
- [ ] 5.12 In `app.js`: Remove `renderStudentLoadingState()` for the session card (simplify loading state)
- [ ] 5.13 In `app.js`: When switching to Progress tab (setView "progress"), remove chart rendering call — no charts to render
- [ ] 5.14 In `app.js`: Remove `dom.clockQuickStats`, `dom.jumpToProgressButton`, `dom.progressSummaryCards`, `dom.gaugeGrid`, `dom.studentHeatmap`, `dom.studentHeatmapLegend`, `dom.studentExceptionsList`, `dom.rangeButtons` DOM references
- [ ] 5.15 In `app.js`: Add new DOM references: `dom.weekPointsStat`, `dom.weekHoursStat`, `dom.sevenDayHistoryList`
- [ ] 5.16 Keep ALL admin logic completely untouched (admin charts, admin tables, admin auth, Google Sheet link)
- [ ] 5.17 Remove `renderLocalHistory()` call (local device history removed from UI)
- [ ] 5.18 Update inactivity reset timer — keep at 90 seconds (unchanged)

### Phase 6: Polish & Quality
- [ ] 6.1 Test Check In flow end-to-end (ID → GPS → button appears → tap → toast → state update)
- [ ] 6.2 Test Check Out flow end-to-end
- [ ] 6.3 Test Progress tab shows correct weekly data
- [ ] 6.4 Test 7-day history renders correctly for a loaded student
- [ ] 6.5 Test empty state (no student loaded) on Progress tab looks clean
- [ ] 6.6 Test Admin login → admin content → Google Sheet button → charts all work
- [ ] 6.7 Test dark mode toggle still works and applies correctly
- [ ] 6.8 Test on mobile viewport (390×844, 393×852)
- [ ] 6.9 Verify all touch targets are ≥ 44×44px
- [ ] 6.10 Run Playwright screenshots: clock empty state, clock with student loaded, progress with data, admin login, admin dashboard
- [ ] 6.11 Verify no Google Sheet link appears outside admin-authenticated section
- [ ] 6.12 Verify font rendering: SF Pro on iOS/macOS, system-ui fallback on Android/Windows
- [ ] 6.13 Git commit all changes with a clear commit message
- [ ] 6.14 Git push to GitHub remote (origin main)

---

## 5. ARCHITECTURE DECISIONS

### No Backend Changes
The Google Apps Script backend (`Code.gs`) does not need any changes. The student dashboard API already returns exactly the data we need:
- `data.week.totalPoints` — weekly points total
- `data.week.hoursDecimal` — weekly hours total
- `data.recentShifts` — array of recent shifts (filter to last 7 days client-side)
- `data.student.name` — student name
- `data.today.status` — today's check-in status

### Single Range Fetch
Currently the app prefetches all 3 ranges (week/month/overall). After this redesign, students only need `range=week`. This reduces API calls to 1/3 and simplifies state management significantly.

### Admin Unchanged
The admin view retains ALL current functionality:
- Password auth (8-hour session token)
- KPI strip (cohort health metrics)
- Cohort trend chart
- Leaderboard chart
- Advanced analytics (scatter, exception, site breakdown, heatmap)
- Student analysis table
- Exceptions & audit trail
- Student detail drawer
- Print / PDF / CSV export
- Google Sheet link (prominently placed, accessible only after admin login)

---

## 6. DESIGN MOCKUP (ASCII)

### Clock View — Empty State
```
┌─────────────────────────────┐
│  ← safe area top            │
├─────────────────────────────┤
│  Clock In              [🌙] │  ← thin frosted nav (34pt bold)
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │  Enter your           │  │
│  │  Student ID           │  │
│  │  [    6-digit ID   ]  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  No student loaded    │  │
│  │  Enter your ID above  │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  📍 Getting location…│  │
│  └───────────────────────┘  │
│                             │
└─────────────────────────────┘
│ [Clock]  [My Week]  [Admin] │ ← 49px tab bar
└─────────────────────────────┘
```

### Clock View — Student Loaded, Ready to Check In
```
┌─────────────────────────────┐
│  Clock In                   │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │  Jordan Belvin        │  │
│  │  Ready to check in    │  │
│  │  📍 Alliance Diesel   │  │
│  └───────────────────────┘  │
│                             │
│  ┌───────────────────────┐  │
│  │  [  ✓  CHECK IN  ]   │  │  ← Full width green button 56px
│  └───────────────────────┘  │
│                             │
│  ┌─────────┐  ┌──────────┐  │
│  │ POINTS  │  │  HOURS   │  │
│  │  20 pts │  │  3.5 hrs │  │  ← 52px SF Pro Display
│  │  week   │  │  week    │  │
│  └─────────┘  └──────────┘  │
└─────────────────────────────┘
│ [Clock]  [My Week]  [Admin] │
└─────────────────────────────┘
```

### My Week View — With Data
```
┌─────────────────────────────┐
│  My Week                    │
├─────────────────────────────┤
│  ┌─────────┐  ┌──────────┐  │
│  │ POINTS  │  │  HOURS   │  │
│  │   30    │  │   4.5    │  │  ← 56px bold numbers
│  │  pts    │  │   hrs    │  │
│  └─────────┘  └──────────┘  │
│                             │
│  LAST 7 DAYS                │  ← Section header
│  ┌───────────────────────┐  │
│  │ Mon Mar 4  ● 8:02am   │  │  ← ● green=check-in ● blue=check-out
│  │            ○ 4:15pm   │  │
│  ├───────────────────────┤  │
│  │ Tue Mar 5  ● 8:10am   │  │
│  │            ○ 4:20pm   │  │
│  ├───────────────────────┤  │
│  │ Wed Mar 6     —       │  │
│  ├───────────────────────┤  │
│  │ Thu Mar 7  ● 8:05am   │  │
│  │            ○ 3:58pm   │  │
│  ├───────────────────────┤  │
│  │ Fri Mar 8  ● 8:01am   │  │
│  │            ○ in prog  │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
│ [Clock]  [My Week]  [Admin] │
└─────────────────────────────┘
```

### Admin View — After Login (Unchanged Functionally)
```
┌─────────────────────────────┐
│  Admin Dashboard            │
├─────────────────────────────┤
│  [Range ▾] [Site ▾] [Search]│
│  [Refresh][Print][PDF][CSV] │
│  ┌─────────────────────┐   │
│  │ 📊 Open Google Sheet │   │  ← Prominent button
│  └─────────────────────┘   │
│                             │
│  COHORT HEALTH              │
│  ┌────┐ ┌────┐ ┌────┐ ┌──┐ │
│  │KPI1│ │KPI2│ │KPI3│ │..│ │
│  └────┘ └────┘ └────┘ └──┘ │
│                             │
│  [Cohort Trend Chart       ]│
│  [Leaderboard Chart        ]│
│  ▸ Advanced Analytics       │
│  [Student Analysis Table   ]│
│  ▸ Exceptions & Audit Trail │
└─────────────────────────────┘
│ [Clock]  [My Week]  [Admin] │
└─────────────────────────────┘
```

---

## 7. KEY DESIGN PRINCIPLES TO FOLLOW (Apple HIG)

1. **Clarity** — Use whitespace aggressively. Every element on screen should have a clear purpose.
2. **Deference** — The UI should defer to content. Cards should recede; data should come forward.
3. **Depth** — Use subtle shadows and layering to create hierarchy, not decorative gradients.
4. **Minimum 44×44pt touch targets** — Every tappable element must meet this minimum.
5. **No duplicate data** — Students see week data once, not in multiple formats.
6. **Light by default** — iOS defaults to light mode. Dark mode is offered via the toggle.
7. **System font stack** — `-apple-system, BlinkMacSystemFont, "SF Pro Text"` (already correct).
8. **Color with purpose** — Green = check in (positive/go), Blue = check out (informational/done), Red = error only.
9. **One primary action per screen** — The Clock view has ONE dominant button. Everything else is secondary.
10. **Liquid Glass lite** — For a web app, we approximate iOS 26's Liquid Glass with `backdrop-filter: blur(20px)` on the nav bar and tab bar only, white opaque cards for content.

---

## 8. WHAT STAYS THE SAME

- All Google Apps Script backend logic (`Code.gs`)
- The apps-script deployment and Sheet ID
- The student roster (`STUDENT_DB` in `config.js`)
- The site list and GPS coordinates (`SITES` in `config.js`)
- The admin password hash and session logic
- All admin dashboard charts and analytics
- The API endpoint structure
- Toast notification system
- The geofencing logic
- The 90-second inactivity reset
- The Check In / Check Out submission logic to backend
- The PDF / Print / CSV export functionality for admin
- The student detail drawer (admin only)
- The report modal (admin only)

---

*End of Plan*
