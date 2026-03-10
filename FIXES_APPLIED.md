# Fixes Applied - March 10, 2026

## Critical Fixes ✅

### 1. Security: Removed Hardcoded API Credentials
**File:** `assets/js/config.js`
**Change:** Moved `APPS_SCRIPT_URL` from hardcoded string to environment variable
- Now reads from `VITE_APPS_SCRIPT_URL` environment variable
- Throws helpful error if not configured
- Prevents API deployment ID from being exposed in source code, git history, and browser

**Action Required:**
```bash
# Create .env.production with your actual URL:
cp .env.example .env.production

# Edit .env.production and add your Google Apps Script deployment URL:
# VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_ID/exec
```

### 2. Testing: Removed Hardcoded Test Password
**File:** `tests/smoke.spec.js`
**Change:** Removed fallback password "Bulldog!1"
- Now requires `PLAYWRIGHT_ADMIN_PASSWORD` environment variable
- Throws error with helpful message if not set
- Prevents password from appearing in version control

**Action Required:**
```bash
# Set before running tests:
export PLAYWRIGHT_ADMIN_PASSWORD="your_actual_test_password"
npm run smoke:local
```

## High Priority Fixes ✅

### 3. Configuration: Updated Node.js Requirements
**File:** `package.json`
**Change:** Updated engine requirements
- **Before:** `node >= 14.0.0` (End-of-Life)
- **After:** `node >= 18.0.0`, `npm >= 9.0.0`
- Ensures team uses modern, secure versions
- Aligns with current development standards

### 4. Dependencies: Fixed Version Mismatches
**File:** `package.json`
**Changes:**
- `@playwright/test`: `^1.42.0` → `^1.58.0`
- `playwright`: `^1.42.0` → `^1.58.0`
- `vite`: `^7.1.5` → `^7.3.0`
- Now matches what's actually installed
- Prevents version conflicts between lock file and package.json

## Code Quality Fixes ✅

### 5. Version Control: Improved .gitignore
**File:** `.gitignore`
**Changes:**
- Added environment variable files: `.env`, `.env.local`, `.env.production`
- Added IDE directories: `.vscode/`, `.idea/`, `.cursor/`
- Added OS files: `Thumbs.db`, `.AppleDouble`
- Added test coverage directory: `coverage/`
- Added helpful section comments for organization
- Prevents accidental credential exposure

### 6. Documentation: Added Environment Template
**File:** `.env.example` (NEW)
**Purpose:**
- Provides template for environment variables
- Includes comments on where to get values
- Helps new developers understand required configuration

## Next Steps for Deployment

### 1. Update Vercel Environment Variables
In your Vercel dashboard (Settings → Environment Variables):
```
VITE_APPS_SCRIPT_URL = https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

### 2. Update GitHub Actions/CI CD
If using GitHub Actions for tests, add to secrets:
```
PLAYWRIGHT_ADMIN_PASSWORD = your_test_password
```

### 3. Local Development Setup
```bash
# Copy example file
cp .env.example .env.local

# Edit with your actual values
# VITE_APPS_SCRIPT_URL=...
# PLAYWRIGHT_ADMIN_PASSWORD=...

# Install updated dependencies
npm install

# Test build
npm run build

# Test locally
npm run dev
```

### 4. Commit and Push
See GitHub commands below.

---

## File Changes Summary

| File | Change Type | Severity |
|------|------------|----------|
| `assets/js/config.js` | Modified | CRITICAL |
| `tests/smoke.spec.js` | Modified | HIGH |
| `package.json` | Modified | HIGH |
| `.gitignore` | Modified | MEDIUM |
| `.env.example` | Created | MEDIUM |
| `PROJECT_ISSUES_AND_FIXES.md` | Created | INFO |
| `FIXES_APPLIED.md` | Created | INFO |

---

## Verification Checklist

- [ ] `.env.example` copied to `.env.local`
- [ ] VITE_APPS_SCRIPT_URL added to `.env.local`
- [ ] PLAYWRIGHT_ADMIN_PASSWORD set in environment
- [ ] `npm install` completed
- [ ] `npm run build` succeeds
- [ ] `npm run smoke:local` passes
- [ ] No console errors in dev: `npm run dev`
- [ ] `.env.local` and `.env.production` NOT committed to git
- [ ] Changes pushed to GitHub

