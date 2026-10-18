# Testing

**Status (verified 2026-10-18):**

| Suite | Tool | Files | Tests | Result |
|---|---|---:|---:|---|
| Backend unit + integration | Vitest, Supertest, mongodb-memory-server (replica set) | 20 | 218 | ✅ all pass |
| Frontend unit + component | Vitest, React Testing Library, jsdom | 11 | 122 | ✅ all pass |
| End-to-end + accessibility | Playwright (Chromium), axe-core | 2 | 11 | ✅ all pass |

Each suite has been run at least twice in a row with the same result.

## How to run

```bash
cd backend && npm test          # needs nothing external: starts an in-memory MongoDB replica set
cd frontend && npm test         # API layer mocked; no servers needed
cd frontend && npx playwright install chromium   # once
cd frontend && npm run test:e2e # starts its own backend (port 4100) and frontend (5180)
```

End-to-end tests need a MongoDB replica set. By default they use `MONGODB_URI` from `backend/.env` with the database name replaced by **`crm_e2e`**; set `E2E_MONGODB_URI` to use another one. The database is re-seeded (300 deterministic contacts) before every run. The seed refuses any database whose name doesn't end in `_dev`, `_test`, or `_e2e`.

## Isolation

| Level | How tests are kept independent |
|---|---|
| Backend | Each test file gets its own in-memory replica set; collections are cleared before every test; indexes are built up front |
| Frontend | The `api/contacts` module is mocked per test (`vi.mock` + `resetAllMocks`); DOM is cleaned up after each test |
| End-to-end | Own servers and own database (`crm_e2e`), re-seeded per run; each test uses different contacts and run-unique tag/company values; one worker, because all tests share one database. Verified that a run leaves `crm_dev` untouched |

## Requirement → test traceability

IDs refer to [00-requirements.md](00-requirements.md). File paths are relative to `backend/test/`, `frontend/src/`, or `frontend/e2e/`.

| Requirement | What is proven | Tests |
|---|---|---|
| FR-01–02, FR-05 model | Fields, limits, version 1, timestamps, no `__v`, unknown fields rejected | `contact.model.test.ts`, `activity.model.test.ts` |
| FR-03, NFR-04 email uniqueness | Duplicate → 11000/409; case and whitespace variants collide; **10 concurrent inserts → 1 succeeds**; any number of contacts without email; explicit nulls not indexed | `contact.model.test.ts`, `contacts.update.test.ts` |
| FR-04 normalization | Email, text, phone digits, tags, Unicode NFC | `contact.normalize.test.ts` |
| FR-10–16, NFR-02/03/06/07 list | Prefix search per field, case-insensitive, regex characters literal, phone formats, company and AND-tag filters, combinations, all sorts with `_id` tie-breaker, every row once across pages, page limits, deep-offset limit, injection attempts rejected, unknown parameters rejected | `contacts.list.test.ts`, `contact.query.test.ts` |
| NFR-01 scale | No collection scans on 100k contacts; partial-index `$type` regression guard | `npm run explain` (see [performance.md](performance.md)), `contact.query.test.ts` |
| FR-20 get | 200 DTO shape, 404, 400 `INVALID_ID` | `contacts.get.test.ts` |
| FR-21–26, NFR-05 update + concurrency | Version increments; **stale update → 409 with current state, no overwrite**; **2 and 10 concurrent same-version writers → exactly 1 wins**; change between read and write still caught; deleted mid-update → 404; duplicate email → 409; no-op keeps version; clearing fields; search fields recomputed | `contacts.update.test.ts`, `contact.update.test.ts` |
| FR-30–36 tags | Normalized add, no-op add/remove, **concurrent duplicate adds → 1 activity**, concurrent different tags all kept, 50-tag limit, tags don't bump version | `tags.test.ts` |
| FR-33–34, FR-46 bulk | Mixed batch counts, one activity per changed contact with shared bulk id, deduplication, idempotent retry, bulk racing single adds, all-or-nothing on failure, 500-id limit | `bulk-tags.test.ts` |
| FR-40–45 activity | Only real changes recorded, newest first, `_id` tie-break, limit, 404 for unknown contact; contact change and activity roll back together | `activities.test.ts`, `transaction.test.ts`, rollback cases in `contacts.update.test.ts` / `tags.test.ts` / `bulk-tags.test.ts` |
| NFR-08 errors | One error shape; 400/404/409/413/422/500/503 mappings; internals hidden in 500s | `errorHandler.test.ts`, `validated.test.ts`, `health.test.ts` |
| NFR-15 logging | Request ID on every response; path logged, **query string never logged** | `requestLogger.test.ts` |
| FR-50/51/54 UI states | Loading, empty vs no-match, error + retry, past-the-end page | `features/contacts/list/ContactsPage.test.tsx`, `…/detail/ContactDetailPage.test.tsx` |
| NFR-13 request races | Out-of-order responses (including a source that ignores abort), cancellation on key change and unmount, Strict Mode double mount, debounce | `hooks/useApiRequest.test.tsx`, `hooks/hooks.test.tsx`, `ContactsPage.test.tsx` |
| AC-21 URL state | Parsing with fallbacks, page reset on criteria change, back button | `features/contacts/list/listParams.test.tsx`, e2e `contacts.spec.ts` |
| FR-52/53/57 validation | Client validation blocks the request; server field errors and duplicate email shown on fields | `ContactDetailPage.test.tsx`, `contactForm.test.ts`, e2e `contacts.spec.ts` |
| FR-55/56 conflicts | Draft kept; conflict banner; **three-way merge keeps the other user's edits**; use theirs | `contactForm.test.ts`, `ContactDetailPage.test.tsx`, **e2e two-browser test** |
| AC-25 double submit | One request per save | `ContactDetailPage.test.tsx`, `components.test.tsx` |
| AC-26 bulk UI | Summary, refresh, selection cleared on success, kept on failure, reset when criteria change | `ContactsPage.test.tsx`, e2e `contacts.spec.ts` |
| Main journey | Browse, search, filter, sort, paginate, open, edit, tag, bulk tag, activity, persistence after reload, back navigation | e2e `contacts.spec.ts` |
| NFR-14 accessibility | No axe (WCAG 2.1 A/AA) violations on list (with bulk bar) and detail (with a field error); labelled controls queried by role/name throughout | e2e `accessibility.spec.ts`, all component tests |
| FR-61 seed safety | Refuses production and non-disposable database names; repeatable | `seed.test.ts` |
| NFR-11 config | Env validation; refuses a non-replica-set database | `config.test.ts`, `db-connection.test.ts` |

## Do the tests catch real bugs? (mutation checks)

Each guarantee below was deliberately broken in the source, the relevant tests were run, and the source was restored and confirmed identical.

| Deliberate bug | Caught? |
|---|---|
| Version removed from the update filter (read-then-write) | ✅ 3 concurrency tests fail. The sequential stale-update test still passes because the early version check catches it — only concurrent requests expose this bug |
| Early version check removed | Correctly **not** caught: correctness comes from the atomic write; the check only saves work |
| Regex escaping removed | ✅ |
| `_id` tie-breaker removed from sorts | ✅ by unit tests. ⚠️ API tests alone pass, because the indexes already order ties by `_id` |
| `$addToSet` without the "not already present" filter | ✅ 2 tag tests fail |
| Bulk activities recorded for all found contacts | ✅ 3 bulk tests fail |
| Stale-response guard removed from `useApiRequest` | ✅ — but only after adding a test with a source that ignores abort; the first version of the tests passed without the guard |
| Naive "keep my draft" instead of the three-way merge | ✅ |
| Selection-reset `key` removed from the list view | ✅ |
| Labels removed from row checkboxes | ✅ axe reports a critical `label` violation |

## Verified by hand (not automated)

| What | When / how |
|---|---|
| Data survives a backend restart (FR-05) | Phase 2: transactional write on Atlas, backend restarted, data read back from a new process |
| Query plans at 100k contacts (NFR-01) | Phase 5: `npm run explain` — results in [performance.md](performance.md) |
| Every screen against real data, backend stopped and restarted, 375 px layout | Phase 10, in a browser |

## Known gaps

- **No load or throughput testing.** Performance evidence is query plans (reads per query), not requests per second under concurrency.
- **End-to-end tests run in Chromium only**, and depend on network access to the MongoDB deployment.
- **Accessibility:** automated axe checks only. Keyboard-only and screen-reader walkthroughs have not been done systematically.
- **No CI pipeline** is configured; all results above are from local runs.
- **No visual-regression tests.**
