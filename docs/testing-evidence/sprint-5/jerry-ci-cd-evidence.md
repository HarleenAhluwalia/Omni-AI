# Sprint 5 - CI/CD Evidence

**Owner:** Jerry
**Workflow:** `.github/workflows/ci.yml` (triggers on push to `main` and `Jerry-Sprint-5-cicd`, and on pull requests to `main`)

## 1. Jobs in the workflow

| Job | Owner | What it checks |
|-----|-------|----------------|
| `backend-tests` | Jerry | `npm ci` and the full backend suite; generates a build ID |
| `harleen-frontend-ci` | Harleen | Vite production build; Prioritized To-Do tests |
| `medrian-ai-api-tests` | Medrian | AI/API and UC-1 workflow tests |
| `alan-ai-ci` | Alan | Prioritisation, scheduling, workload, Dummy Canvas API tests |
| `harleen-canvas-preferences-tests` | Harleen | Canvas API and Preferences contract tests; standalone Dummy Canvas tests |
| `jerry-cc72-security-monitoring` | Jerry | SOC 2 CC7.2 security-logging tests; uploads `cc72-results.json` as evidence |
| `jerry-sprint5-reliability` | Jerry | Full backend suite with coverage; DB integrity tests (skipped without `TEST_SUPABASE_*` secrets); uploads results and coverage as evidence |

Build ID format: `omni-ai-build-<run_number>-<short_sha>`.

## 2. Release-candidate run (fill in after the final run)

| Item | Value |
|------|-------|
| Branch | _<branch>_ |
| Commit SHA | _<sha>_ |
| Workflow run URL | _<https://github.com/HarleenAhluwalia/Omni-AI/actions/runs/...>_ |
| Build ID | _<omni-ai-build-N-sha>_ |
| Run date | _<date>_ |
| Overall result | _<pass/fail>_ |

| Job | Result | Duration |
|-----|--------|----------|
| backend-tests | | |
| harleen-frontend-ci | | |
| medrian-ai-api-tests | | |
| alan-ai-ci | | |
| harleen-canvas-preferences-tests | | |
| jerry-cc72-security-monitoring | | |
| jerry-sprint5-reliability | | |

## 3. Test totals (from `s5-results.json` in the `sprint5-results-<build-id>` artifact)

| Metric | Count |
|--------|-------|
| Test suites passed / failed | |
| Tests passed | |
| Tests failed | |
| Tests skipped | |

Coverage (from the `coverage/` folder in the same artifact): statements _<%>_, branches _<%>_, functions _<%>_, lines _<%>_.

## 4. Known skips and gaps

- `tests/dbIntegrity.test.js` only runs against a real database when `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_KEY` repository secrets are set. State here whether they were set for the release run: _<yes/no>_.
- The frontend build step needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` secrets: _<set/not set>_.
- Ollama-based live AI behaviour is not exercised in CI and is verified manually in the dry run.

## 5. Demo steps (script section 4.5, steps 7-10)

| Step | Action | Expected result | Pass/Fail |
|------|--------|-----------------|-----------|
| 7 | Open the Omni AI GitHub repository | Repository appears | |
| 8 | Open the Actions tab | Workflow runs listed | |
| 9 | Open a verified successful run | Passing jobs, build ID in the log | |
| 10 | Explain how automated tests catch regressions | Audience understands the process | |

Screenshot SS-24 (successful GitHub Actions workflow): _<path>_

Choose the run to show before the demo, and confirm it is green and on the release-candidate commit.

## 6. Failures during Sprint 5 and how they were resolved

| Date | Run / Build ID | Failing job | Cause | Fix |
|------|----------------|-------------|-------|-----|
| | | | | |
