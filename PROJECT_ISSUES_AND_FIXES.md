# InternTrack Project: Issues & Fixes Analysis
**Generated:** March 10, 2026
**Project:** auto-intern-tracker (v2.0.0)

---

## Executive Summary

This analysis identified **7 issues** across your InternTrack project:
- **2 Critical** (prevents builds/deployment)
- **2 High** (security/configuration concerns)
- **3 Medium** (dependency and documentation issues)

All issues have documented fixes below.

---

## Issue #1: BUILD FAILURE — Missing Platform-Specific Rollup Binary
**Severity:** 🔴 **CRITICAL**
**Component:** Build System (Vite/Rollup)
**Status:** Blocking (npm run build fails)

### Problem
```
Error: Cannot find module '@rollup/rollup-linux-arm64-gnu'
  at Function._resolveFilename (node:internal/modules/cjs-loader:1383:15)
  at requireWithFriendlyError (/sessions/.../node_modules/rollup/dist/native.js:97:10)
```

When running `npm run build`, Rollup cannot find the ARM64 Linux native binary. This typically occurs when:
- `package-lock.json` was generated on a different architecture (e.g., Mac M1)
- The current build environment is ARM64 Linux
- Optional dependencies for the target platform were not installed

### Root Cause
Vite 7.3.1 uses Rollup with platform-specific native bindings. Your lock file was likely created on a different architecture, and the required ARM64 Linux binary is missing.

### How to Fix
**Option A: Clean Install (Recommended)**
```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Option B: Install Missing Optional Dependency**
```bash
npm install --save-optional @rollup/rollup-linux-arm64-gnu
npm run build
```

**Option C: Downgrade Vite to Last Stable**
If clean install fails, downgrade to Vite 7.0.4 (the last version before recent breaking changes):
```bash
npm install --save-dev vite@7.0.4
npm run build
```

**Option D: Cross-Platform Package Lock Regeneration**
```bash
npm ci --prefer-offline --no-audit
npm run build
```

### References
- [Vite Issue #15167](https://github.com/vitejs/vite/issues/15167): Multi-platform build failures
- [Vite Issue #20766](https://github.com/vitejs/vite/issues/20766): ARM64 rollup binary missing
- [Netlify Support Forum](https://answers.netlify.com/t/react-vite-build-fails-because-of-rollup-rollup-linux-x64-gnu/107504): Real-world Docker build fixes
- [Medium: Node 18 Rollup Fix](https://elvisciotti.medium.com/node-18-fix-missing-rollup-package-3df70f621bb4)

---

## Issue #2: SECURITY — Hardcoded Google Apps Script Deployment URL
**Severity:** 🔴 **CRITICAL**
**Component:** Frontend Configuration (`assets/js/config.js`)
**Scope:** Public exposure in browser

### Problem
```javascript
// Line 1 of assets/js/config.js
export const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw3GBhNTbtaOlSVBL6r9SJqXX1CuTgSNP0DOnp8jxH0zvTofzyZkmK_OWruVqq9Fbs/exec";
```

Your Google Apps Script deployment ID is visible in:
- Browser DevTools (Network tab)
- Browser source code (Ctrl+U / View Source)
- Built `dist/index.html` (when deployed)
- Git history and any CI/CD logs

**Risk:** An attacker with this URL can:
- Directly call your backend API without authentication (check-in/check-out)
- Spam the attendance log
- Manipulate points and hours
- Extract sensitive student data through admin endpoints (if admin_auth is weak)

### How to Fix

**Option A: Backend Proxy (Most Secure)**
Create a lightweight backend proxy on your Vercel deployment:
1. Add a `/api/` directory with serverless functions
2. Frontend calls `https://internship-student-tracker.vercel.app/api/checkin` (your domain)
3. Vercel function adds the APPS_SCRIPT_URL and proxies the request
4. Only the deployment URL is exposed, not the Apps Script ID

Example (`vercel/api/checkin.js`):
```javascript
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL; // Store in Vercel env

export default async function handler(req, res) {
  const body = JSON.stringify(req.body);
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body
  });
  const data = await response.json();
  res.status(response.status).json(data);
}
```

**Option B: Move to Environment Variables (Quick Fix)**
```javascript
// config.js
export const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "fallback";
```

Add to `.env.production`:
```
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/AKfycbw3...
```

Note: This is LESS secure than Option A (still visible in built output), but prevents accidental exposure in version control.

**Option C: Restrict Apps Script Access (Band-aid)**
In Google Apps Script `Code.gs`, add IP whitelist or additional authentication:
```javascript
function doPost(e) {
  const clientIp = e.contextPath; // or use custom header
  if (!ALLOWED_IPS.includes(clientIp)) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, code: "UNAUTHORIZED" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // ... rest of logic
}
```

### References
- [Sourcery: Hardcoded API Keys Vulnerability](https://www.sourcery.ai/vulnerabilities/hardcoded-api-keys-javascript)
- [Medium: Hide API Keys in Client-Side JS](https://medium.com/@george-okumu/how-to-hide-api-keys-in-client-side-javascript-in-plain-html-javascript-project-7f021100f742)
- [OWASP: Information Leakage Review](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/05-Review_Web_Page_Content_for_Information_Leakage)
- [Microsoft Q&A: Securing Keys in JavaScript](https://learn.microsoft.com/en-us/answers/questions/911557/how-to-secure-keys-in-javascript)

---

## Issue #3: CONFIGURATION — Outdated Node.js Version Requirement
**Severity:** 🟡 **HIGH**
**Component:** `package.json` / DevOps
**Current Setting:** `"engines": { "node": ">=14.0.0" }`

### Problem
Node 14 reached End-of-Life (EOL) on April 30, 2023. Your app is running on Node 22.22.0 during builds, but your `package.json` still declares support for Node 14+.

**Risks:**
- Developers may use incompatible Node versions
- Deployment platforms (Vercel, Netlify) may choose EOL runtimes
- Security vulnerabilities in old Node are not patched
- npm packages drop support for Node 14 regularly

### How to Fix

Update `package.json`:
```json
{
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

**Recommended versions:**
- **Minimum:** Node 18 LTS (April 2024 EOL → April 2025, safe for 1 year)
- **Safe:** Node 20 LTS (April 2026 EOL, aligns with your current work)
- **Latest:** Node 22+ (for new projects)

**Verify your local version:**
```bash
node --version   # Should show v20.x.x or higher
npm --version    # Should show v9.x.x or higher
```

---

## Issue #4: CODE QUALITY — Playwright Tests with Hardcoded Admin Password
**Severity:** 🟡 **HIGH**
**Component:** `tests/smoke.spec.js` (line 6)
**Type:** Test Configuration / Credential Management

### Problem
```javascript
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || "Bulldog!1";
```

The test file has a hardcoded fallback password. If `PLAYWRIGHT_ADMIN_PASSWORD` is not set, tests use "Bulldog!1".

**Risks:**
- Password is visible in version control history
- CI/CD logs may expose the environment variable if tests fail
- Local developers might accidentally use the same password in production
- If this is the actual admin password, it's now public

### How to Fix

**Option A: Remove Fallback (Strict)**
```javascript
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  throw new Error("PLAYWRIGHT_ADMIN_PASSWORD environment variable is required");
}
```

**Option B: Use Different Test Password**
Generate a dedicated test password in your Google Sheet test environment:
```javascript
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || "TEST_ONLY_Bulldog123!";
```

**Option C: Add .env.local to .gitignore**
```bash
# Ensure .env, .env.local, and test credentials are not committed
echo ".env.local" >> .gitignore
echo "PLAYWRIGHT_ADMIN_PASSWORD" >> .env.local
```

**CI/CD Setup (GitHub Actions example):**
```yaml
# .github/workflows/test.yml
env:
  PLAYWRIGHT_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
```

---

## Issue #5: DEPENDENCY CONFLICT — Version Mismatch in package.json
**Severity:** 🟠 **MEDIUM**
**Component:** `package.json` devDependencies
**Details:**
- `vite@^7.1.5` (specified) but `vite@7.3.1` (installed)
- `@playwright/test@^1.42.0` (specified) but `@playwright/test@1.58.2` (installed)
- `playwright@^1.42.0` (specified) but `playwright@1.58.2` (installed)

### Problem
The `^` (caret) in semantic versioning allows patch and minor version updates. The installed versions are significantly newer (1.42 → 1.58 is a large jump). While tests pass, this can cause:
- Inconsistent behavior between CI/CD and local dev
- Breaking changes if you downgrade
- Issues if you need to reproduce exact test results

### How to Fix

**Option A: Update package.json to match installed versions (Recommended)**
```json
{
  "devDependencies": {
    "@playwright/test": "^1.58.0",
    "playwright": "^1.58.0",
    "vite": "^7.3.0"
  }
}
```
Then run:
```bash
npm install
```

**Option B: Lock to Exact Versions**
```json
{
  "devDependencies": {
    "@playwright/test": "1.58.2",
    "playwright": "1.58.2",
    "vite": "7.3.1"
  }
}
```

**Option C: Pin to Tested Minor Versions**
If older versions are intentional, pin them:
```json
{
  "devDependencies": {
    "@playwright/test": "1.42.x",
    "playwright": "1.42.x",
    "vite": "7.1.x"
  }
}
```

Then run:
```bash
npm install
npm ci  # For CI/CD to use lock file
```

---

## Issue #6: DOCUMENTATION — Misleading .gitignore Configuration
**Severity:** 🟠 **MEDIUM**
**Component:** `.gitignore`
**Current Content:**
```
node_modules/
playwright-report/
test-results/
output/
dist/
.DS_Store
.vercel
```

### Problem
The `.gitignore` is correct in what it ignores, but there are edge cases:

1. **Missing `.env` files**: No `.env.local`, `.env.production`, etc. If you add environment variables, they'll be committed
2. **Missing IDE directories**: `.vscode`, `.idea`, `.cursor` files should be ignored
3. **Missing OS files**: Thumbs.db (Windows), .AppleDouble (Mac)
4. **Incomplete Vercel config**: Only `.vercel` folder is ignored, not `.vercelignore` or individual files

### How to Fix

Update `.gitignore`:
```
# Dependencies
node_modules/
package-lock.json
yarn.lock

# Environment Variables (IMPORTANT: Never commit secrets)
.env
.env.local
.env.production
.env.*.local

# Build & Test Output
dist/
build/
playwright-report/
playwright-results/
test-results/
output/
coverage/

# Vercel
.vercel
.vercelignore

# IDE & Editor
.vscode/
.idea/
.cursor/
*.swp
*.swo
*~
.DS_Store
Thumbs.db

# Local Dev
.env.local
.cache/
```

---

## Issue #7: PROJECT STRUCTURE — Folder Name Mismatch with App Branding
**Severity:** 🟢 **LOW**
**Component:** Project Organization
**Current:** Folder named `InternshipStudenTracker` but app is called `Intern Track`

### Problem
- Folder name has typo: "Studen" instead of "Student"
- Doesn't match the published app name "Intern Track"
- May confuse team members about the actual project
- Package.json calls it "auto-intern-tracker" (different naming)

### How to Fix

**Option A: Rename folder (if no external references)**
```bash
mv InternshipStudenTracker InternTracker
# or
mv InternshipStudenTracker auto-intern-tracker
```

**Option B: Update documentation to clarify**
Add a note to README:
```markdown
## Project Names

- **GitHub/Folder**: `auto-intern-tracker`
- **App Name**: `Intern Track` (shown in browser tab/header)
- **Package**: `auto-intern-tracker` (in package.json)
```

**Recommendation:** Keep folder as-is since it's established in Git history, but update all documentation to reference the official app name consistently.

---

## Issue #8: DEPENDENCY SECURITY — npm audit Results
**Severity:** 🟢 **LOW**
**Component:** npm packages
**Current Status:** ✅ No vulnerabilities found

```
npm audit output: "found 0 vulnerabilities"
```

**Recommendation:** Continue running `npm audit` regularly:
```bash
npm audit  # Check for vulnerabilities
npm audit --audit-level=moderate  # Stricter checking
npm audit fix  # Auto-fix when available
```

---

## Summary Table

| Issue | Severity | Component | Status | Fix Time |
|-------|----------|-----------|--------|----------|
| 1. Missing Rollup binary | 🔴 CRITICAL | Build System | Blocking | 5-10 min |
| 2. Hardcoded Apps Script URL | 🔴 CRITICAL | Security | Blocking | 20-30 min |
| 3. Outdated Node version | 🟡 HIGH | Configuration | Warning | 2 min |
| 4. Hardcoded test password | 🟡 HIGH | Testing | Warning | 5 min |
| 5. Dependency version mismatches | 🟠 MEDIUM | Dependencies | Non-blocking | 5 min |
| 6. .gitignore incomplete | 🟠 MEDIUM | Version Control | Non-blocking | 5 min |
| 7. Folder naming inconsistency | 🟢 LOW | Organization | Non-blocking | N/A |
| 8. Security audit | 🟢 LOW | Dependencies | ✅ Clear | N/A |

---

## Recommended Fix Order

### Phase 1: Unblock Builds (Do First)
1. **Issue #1** - Fix build failure (npm clean install)
2. **Issue #2** - Move Apps Script URL to environment variables or proxy

### Phase 2: Harden Security (Do Next)
3. **Issue #4** - Remove hardcoded test password
4. **Issue #3** - Update Node.js version requirement

### Phase 3: Improve Code Quality (Optional)
5. **Issue #5** - Resolve dependency version mismatches
6. **Issue #6** - Improve .gitignore completeness
7. **Issue #7** - Document folder naming strategy

---

## Verification Checklist

After implementing fixes, verify with:

```bash
# Build works
npm run build

# Tests pass
npm run smoke:local

# No console errors
npm run dev
# Check browser DevTools console for errors

# No security warnings
npm audit

# No exposed secrets
grep -r "APPS_SCRIPT_URL\|ADMIN_PASSWORD" dist/

# Logs are clean
npm run test 2>&1 | grep -i error
```

---

## Additional Resources

- [Vite Official Troubleshooting](https://vite.dev/guide/troubleshooting)
- [OWASP: Information Leakage](https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/01-Information_Gathering/05-Review_Web_Page_Content_for_Information_Leakage)
- [Node.js LTS Schedule](https://nodejs.org/en/about/releases/)
- [npm Security Best Practices](https://docs.npmjs.com/cli/v9/commands/npm-audit)

---

**End of Analysis Report**
