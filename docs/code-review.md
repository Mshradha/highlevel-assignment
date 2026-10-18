# Code Review and Quality Audit

**Date:** 2026-10-18 (Phase 12)
**Scope:** the whole repository at commit `35314a4` plus the fixes below.
**Method:** automated scans; a file-by-file read of backend and frontend against the checklist; every suspected problem confirmed with a failing test or a measurement before it was fixed; a clean-copy build.

## Summary

| Severity | Found | Fixed | Accepted (documented) |
|---|---:|---:|---:|
| High (data loss, security hole, wrong results) | 0 | — | — |
| Medium | 2 | 2 | 0 |
| Low | 5 | 5 | 0 |
| Accepted limitations | 9 | — | 9 |

No high-severity issues were found. The two medium issues were accessibility and layout problems: keyboard focus loss, and a list page that didn't fit phone screens (raised during review of this report and fixed).

## Automated checks

| Check | Result |
|---|---|
| `npm audit` (runtime and dev dependencies, both packages) | 0 vulnerabilities |
| `.env` files tracked by git | none |
| MongoDB credentials anywhere in git history | none |
| `eval`, `new Function`, `dangerouslySetInnerHTML`, `innerHTML`, `$where`, `$function`, `mapReduce` | none |
| User input reaching `new RegExp` | only escaped search text and digits-only phone input |
| Leftover `console.log` / `debugger` / `TODO` | only the intended output of the `explain` script |

## Findings and fixes

| # | Severity | Area | Finding | Evidence | Fix |
|---|---|---|---|---|---|
| F1 | **Medium** | Accessibility | **Keyboard focus was lost after saving.** Busy buttons and the inputs being saved used the native `disabled` attribute; browsers drop focus from a focused element that becomes disabled. A keyboard user pressing Enter to add a tag or save the form ended up on `<body>` and had to navigate back. | New e2e `keyboard.spec.ts`: both tests **failed** before the fix ("Expected: focused, Received: inactive") | Busy buttons use `aria-disabled` and ignore clicks (still announced as unavailable, still no double submits); inputs become `readOnly` while saving; after removing a tag, focus moves to the tag input; a conflict moves focus to "Keep my changes". Both keyboard tests pass; component tests updated |
| F7 | **Medium** | Responsive layout | **The list page didn't fit phones.** At 375 px the filter inputs overflowed their panel (grid items refuse to shrink below their natural width), the 7-column table needed 724 px and had to be scrolled sideways, checkboxes were 13×13 px and the tag "×" 12×12 px (below the WCAG 2.2 24 px target size). Only the detail page had been checked on a phone | Measured in the browser at 375 px before fixing | Cards instead of the table up to 860 px (two per row on tablets), switched in JS via `useMediaQuery` so there is only one copy of each control; filters can shrink and stack in one column below 600 px; checkboxes 20 px (24 px on touch screens); 24×24 tap area for the tag "×"; 44 px buttons and inputs on touch screens; smaller page margins on phones; the conflict table scrolls inside its box. New Playwright `mobile` project (Pixel 7) checks no sideways scrolling, cards, tap-target sizes, axe, and a full select → bulk tag → open flow; it fails if the table comes back on phones |
| F2 | Low | Security | No basic security headers on API responses | — | `securityHeaders` middleware: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store` (contact data must not sit in shared caches), `Referrer-Policy: no-referrer`. Test added |
| F3 | Low | Reliability | An unhandled promise rejection had no explicit handling | — | Logged as a structured error, then the process exits so a process manager can restart it |
| F4 | Low | Maintainability | The activity query schema lived in the contacts module (activities depended on contacts for its own input) | Read-through | Moved to `activities/activity.schemas.ts` |
| F5 | Low | Reproducibility | `npm run preview` (the production build) had no `/api` proxy, so the built app couldn't reach the API locally | Read-through | `preview.proxy` added; verified against the production backend build (below) |
| F6 | Low | Documentation | 10 ADRs still said "Proposed" although implemented and tested | Read-through | Statuses updated to "Accepted", with where each is implemented |

## Checklist results

| Area | Verdict | Evidence |
|---|---|---|
| Input validation | ✅ | Every endpoint's params, query, and body parsed by strict Zod schemas in `validated()`; unknown fields rejected; length limits on all strings; Mongoose schema as a second layer that logs a warning if the two disagree |
| Injection | ✅ | Express 5's query parser doesn't build objects from `a[b]=`; schemas reject non-strings (`?company[$ne]=x` → 400, tested); search text regex-escaped and anchored; no server-side JavaScript operators |
| Database constraints | ✅ | Partial unique index on email (10 concurrent inserts → 1 succeeds); `strict: "throw"`; required fields and limits in the schema |
| Index effectiveness | ✅ | Measured on 100k contacts: no collection scans; browse/filter pages read exactly 20 index entries for 20 rows; partial-index search bug found and fixed in Phase 5 ([performance.md](performance.md)) |
| Pagination | ✅ | Page size ≤ 100, offset ≤ 10,000, `_id` tie-breaker, every row exactly once across pages (tested) |
| Error handling | ✅ | One error shape; all library errors mapped (400/404/409/413/422/503); internals only in server logs with a request ID |
| Logging | ✅ | One JSON line per request with request ID; query strings (which can contain emails) never logged — tested |
| Concurrency | ✅ | Version check and write in one `findOneAndUpdate`; 2- and 10-writer tests; a change between read and write still caught; mutation test proves the guarantee comes from the atomic write. Subtle point checked: the update reads the contact outside the transaction, which is safe because the write requires the same version and tag changes (which don't bump the version) affect neither the diff nor the search fields |
| Activity consistency | ✅ | Every change and its activity in one transaction; rollback tested for update, tag, and bulk |
| Bulk operations | ✅ | One snapshot transaction; write conflicts retry the whole batch; a defensive check aborts if the update count ever differs from the classification |
| Frontend race conditions | ✅ | Abort on key change and unmount, stale-response guard (with a test that fails without it), Strict Mode, debounce |
| Accessibility | ✅ after F1 | axe WCAG 2.1 A/AA clean on both screens (desktop and phone); keyboard focus tests; labelled controls throughout |
| Responsive layout | ✅ after F7 | Checked at 375 px, 768 px, and desktop in the browser; automated phone checks in `e2e/responsive.spec.ts` |
| Environment configuration | ✅ | Env validated at startup; `.env.example` for both apps; refuses a non-replica-set database; seed refuses non-disposable databases |
| Reproducible builds | ✅ | Clean copy (only committable files, no `node_modules`/`.env`/`dist`): `npm ci`, typecheck, lint, build, and all unit/integration tests pass for both apps; `node dist/server.js` with `NODE_ENV=production` served the built frontend via `vite preview`, with the new headers present |
| Critical test coverage | ✅ | 358 tests; every Phase 0 requirement mapped in [testing.md](testing.md); 10 mutation checks |

## Accepted limitations (not fixed, by decision)

| # | Limitation | Why it's acceptable here | What production would need |
|---|---|---|---|
| A1 | No authentication, authorization, or multi-tenancy | Out of scope for the assignment | Auth, per-account authorization checks, `accountId` as the first field of every index |
| A2 | No rate limiting | Single-user demo | Per-user/per-IP limits, usually at the gateway |
| A3 | Production needs a same-origin reverse proxy | The API sends no CORS headers, by design (ADR in architecture §1) | Serve the built frontend and the API under one origin, or add an explicit CORS allowlist |
| A4 | Lint has no type-aware rules (e.g. un-awaited promises) | Reviewed by hand; the only intentionally unawaited promise is marked `void` | Enable `typescript-eslint`'s type-checked config |
| A5 | Activity history stores before/after values (personal data) with no retention policy | Useful history is part of the requirement | A retention policy, a TTL index, or redaction |
| A6 | Frontend API types are hand-copied (ADR-001) | End-to-end tests catch drift; 8 endpoints | Generate types from an OpenAPI spec |
| A7 | Search is prefix-only and accent-sensitive; names sort by byte order | Index-friendly by design ([performance.md](performance.md)) | Accent-folded fields or a collation; a search engine for substring/fuzzy search |
| A8 | Search combined with company/tag filters scans that subset; broad searches count every match | Measured and acceptable at 100k | Capped counts, keyset pagination, a search engine |
| A9 | No CI pipeline; e2e runs in Chromium only | All results are from local runs | CI running all three suites on every push, plus Firefox/WebKit |

## Not re-measured

The list queries haven't changed since Phase 5, so the 100k-contact query plans in [performance.md](performance.md) still apply. The `crm_perf_test` database (about 106 MB on Atlas) is still present and can be dropped.
