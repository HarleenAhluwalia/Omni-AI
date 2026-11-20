# Sprint 5 - Study Preferences Verification (UC-9, UC-16)

**Owner:** Jerry
**Feature:** Study Preferences (study-session duration, break interval, daily workload limit, scheduling/communication style, priority weights)
**Code under test:** `client/src/pages/Preferences.jsx`, `client/src/api/preferencesApi.js`, `server/src/controllers/preferencesController.js`, `server/src/routes/preferencesRoutes.js`

## 1. Automated coverage

| Layer | File | What it covers |
|-------|------|----------------|
| Backend API | `server/tests/preferences.test.js` | Auth required (missing/forged/expired token), defaults, save and re-read, upsert (one row per user), validation (ranges, integer-only, weights total 100, unknown options), user isolation, clean 500 on DB failure |
| Frontend contract | `client/tests/preferences.test.mjs` | Default values, validation, numeric normalisation, authenticated GET/PUT, backend error surfaced |

Run locally:

```bash
cd server && JWT_SECRET=ci-test-secret npx jest tests/preferences.test.js --runInBand
cd client && npm run test:harleen
```

Backend result when written: 25 passed, 0 failed.
Release-candidate re-run: _<fill in: date, commit SHA, pass/fail counts>_

## 2. Manual verification (matches demo script section 4.5, steps 1-6)

**Environment:** backend `npm start` (port 4000), frontend `npm run dev` (http://localhost:5173), Supabase configured.
**Account used:** _<demo account email - do not record the password>_
**Tester / date:** _<name, date>_

| Step | Action | Expected result | Actual result | Pass/Fail | Screenshot |
|------|--------|-----------------|---------------|-----------|------------|
| 1 | Log in and open Preferences from the Dashboard | Saved (or default) study settings appear | | | SS-20 |
| 2 | Change study-session duration to 45 minutes | Updated value accepted | | | SS-21 |
| 3 | Change break interval or daily workload limit | Updated setting appears | | | SS-21 |
| 4 | Click Save Preferences | Success confirmation appears | | | SS-22 |
| 5 | Refresh the browser | Saved values are still shown | | | SS-23 |
| 6 | Log out, log back in, open Preferences | Saved values are still shown | | | |

## 3. Negative and edge checks

| Check | Expected result | Actual result | Pass/Fail |
|-------|-----------------|---------------|-----------|
| Study duration 0 or above 240 | Save blocked with a clear message | | |
| Break interval negative or above 120 | Save blocked with a clear message | | |
| Priority weights do not total 100 | Save blocked with "Priority weights must total 100" | | |
| Stop the backend, then click Save | Error shown, no false "saved" message | | |
| Second test account | Does not see the first account's values | | |

## 4. Screenshot evidence

| ID | Description | File |
|----|-------------|------|
| SS-20 | Study Preferences before changes | _<path>_ |
| SS-21 | Updated study-session duration | _<path>_ |
| SS-22 | Preferences saved successfully | _<path>_ |
| SS-23 | Preferences retained after refresh | _<path>_ |

## 5. Defects found

| Jira ID | Summary | Severity | Status |
|---------|---------|----------|--------|
| | | | |

## 6. Conclusion

_<Ready / conditionally ready / not ready for UC-9 and UC-16, with a one-line reason supported by the results above.>_
