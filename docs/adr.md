# Architecture Decision Records

Format: **Context → Decision → Alternatives → Consequences.** Status is `Accepted`, `Proposed`, or `Superseded`.

---

## ADR-001: Two independent packages, no npm workspaces

**Status:** Accepted — implemented (Phase 2)
**Context:** The repo needs `frontend/` and `backend/`. Sharing types between them would need a third package and build wiring (TypeScript project references, ESM/CJS settings).
**Decision:** Two independent npm packages, each with its own `package.json` and lockfile. The frontend keeps its own copy of the API types (`api/types.ts`, about five types).
**Alternatives:** npm workspaces + `shared/` package — one install and shared Zod schemas, but more config and a build order to explain. A full-stack framework — doesn't match the requested stack.
**Consequences:** The frontend's types can drift from the backend's. The integration and E2E tests detect that drift. Revisit if the shared surface grows.

## ADR-002: MongoDB replica set and transactions

**Status:** Accepted (revised 2026-10-18: Docker removed)
**Context:** A contact change and its activity record must not get out of sync (requirement A23). Multi-document transactions require a replica set. `mongod` isn't installed locally, and Docker can't run on the development machine (no WSL), so Docker is not part of the project.
**Decision:**
- **Development database:** MongoDB Atlas free tier (M0). Atlas clusters are always replica sets, so transactions are available and data persists independently of the app. Configured with `MONGODB_URI` in `backend/.env`.
- **Tests:** `MongoMemoryReplSet` (mongodb-memory-server). No external database or network needed.
- Contact write + activity insert run in one `session.withTransaction()`.
- At startup the backend refuses any server that is not a replica set.

**Alternatives:**
- Docker Compose single-node replica set: one command for reviewers, but needs Docker (WSL 2 on Windows). Removed at the author's request.
- Local `mongod` started with `--replSet` + `rs.initiate()`: works without Docker or an account. The startup check accepts it; documented as an alternative in the README.
- Standalone MongoDB + two separate writes: simpler, but if the process crashes between them, a change has no activity (or an activity has no change).
- Outbox pattern: the right tool for downstream events, but more than this assignment needs.

**Consequences:** Reviewers need their own Atlas cluster (about 5 minutes, free) or a local replica set; the README must explain this step clearly. Each write costs slightly more. `withTransaction` retries transient errors automatically. Verified 2026-10-18: a transactional write on Atlas succeeded, and the data survived a backend restart.

## ADR-003: Explicit `version` field for optimistic concurrency

**Status:** Accepted — implemented and tested (Phase 6; concurrency tests in `contacts.update.test.ts`)
**Context:** The stale-update scenario in the assignment.
**Decision:** An integer `version` field. Updates use `findOneAndUpdate({ _id, version: expected }, { …, $inc: { version: 1 } })`. If nothing matches, an existence check decides between 404 and 409. Mongoose's `__v` is disabled.
**Alternatives:**
- Mongoose `__v`: by default it only protects array changes, not field edits.
- Mongoose `optimisticConcurrency: true`: only works with `doc.save()`, which adds an extra round trip and hides the mechanism.
- `updatedAt` as the version: timestamps can collide and are awkward for clients to compare.
- ETag / `If-Match` headers: standard HTTP, but harder to show in a form and in tests. The version in the body could later be exposed as an ETag.
- Pessimistic locks: the assignment says distributed locking isn't required, and locks block other users.
**Consequences:** The client must always send the version it saw. Conflicts become a UX problem, which the three-way conflict banner handles.

## ADR-004: Email normalization + partial unique index

**Status:** Accepted — implemented and tested (Phases 3, 6)
**Context:** Email is optional but unique when present, and duplicates must not appear under concurrency.
**Decision:** Normalize (trim + lowercase) in one function. Store no `email` field at all when empty. Unique index on `email` with `partialFilterExpression: { email: { $type: "string" } }`. Map duplicate-key error `11000` to 409 `DUPLICATE_EMAIL`.
**Alternatives:**
- Check in app code ("find, then save"): race condition — two requests both see "free".
- `sparse: true` unique index: also skips missing fields, but would still index an explicit `null`. The partial filter states the rule exactly.
- Unique index with a case-insensitive collation: avoids storing lowercase, but every query must specify the same collation to use the index.
**Consequences:** The database is the source of truth for uniqueness. The service doesn't pre-check, so there's no time-of-check/time-of-use gap.

## ADR-005: Prefix search on derived lowercase fields

**Status:** Accepted — implemented; measured on 100k contacts (Phase 5, see update below)
**Context:** Search across name, email, and phone must use indexes at millions of rows (requirement A5).
**Decision:** Store `fullNameLower`, `lastNameLower`, `phoneDigits` (email is already lowercase). Search with an anchored, escaped regex (`^…`) in a `$or`. Minimum query length 2.
**Alternatives:**
- Case-insensitive regex `/ann/i`: can't use an index efficiently → collection scan.
- `$text` index: matches whole words (stemmed), not prefixes ("ann" doesn't find "anna"), and can't be combined with our sort indexes.
- Atlas Search / Elasticsearch: the right answer for substring/fuzzy search at scale, but extra infrastructure.
**Consequences:** Extra fields to keep in sync, handled in one function (`deriveSearchFields`). Search results are sorted in memory after matching — a documented limitation.
**Update 2026-10-18 (measured on 100k contacts, [performance.md](performance.md)):** The prediction above was only half right. For common prefixes MongoDB avoids the in-memory sort by walking the sort index and filtering. For rare matches it first read the *whole collection*, because the `$or` branches on the partial `email`/`phoneDigits` indexes weren't indexable. Fixed by repeating `$type: "string"` in those branches (100,000 keys read → 13).

## ADR-006: Offset pagination with bounds

**Status:** Accepted — implemented (Phase 5)
**Context:** The UI needs page navigation. At scale, `skip` and `countDocuments` get slower as offsets and match counts grow.
**Decision:** `page` + `limit` (≤ 100), maximum offset 10,000, sort always ends with `_id`. `find` and `countDocuments` run in parallel with `maxTimeMS`.
**Alternatives:** Keyset/cursor pagination — constant cost per page, but no "jump to page 7" and no simple total. Documented as the scale path.
**Consequences:** Simple to explain and to test; bounded worst case.

## ADR-007: Tags

**Status:** Accepted — implemented and tested (Phase 7; requirements A13, A16–A18)
**Decision:** Tags are lowercase normalized strings inside the contact's `tags` array. Add/remove use filter-guarded atomic updates (`tags: { $ne: tag }` / `tags: tag`), so "did it change?" comes from the database. Tag changes don't bump `version` and don't require one. Duplicate add / absent remove → 200 `changed: false`, no activity.
**Alternatives:** A separate `tags` collection with IDs — supports renaming and colours, but needs joins and is beyond scope. Bumping `version` on tag changes — gives "any change" semantics but causes false conflicts in the edit form.
**Consequences:** `updatedAt` changes on tag operations while `version` doesn't. That's documented in the README.

## ADR-008: Activity history in its own collection

**Status:** Accepted — implemented (Phases 3, 7)
**Decision:** Collection `contact_activities` with index `{ contactId: 1, createdAt: -1, _id: -1 }`.
**Alternatives:** An array inside the contact — grows without limit (16 MB document limit), makes every contact read and write heavier, and adds index churn. A capped "last 20" array plus full history elsewhere — a possible later optimization.
**Consequences:** Reads need a second query (cheap, indexed). Consistency with the contact comes from ADR-002. The activity stores `from`/`to` values, which may contain PII; retention policy is a known limitation.

## ADR-009: Bulk tag assignment in one transaction

**Status:** Accepted — implemented and tested (Phase 7) — **refines requirement A20**
**Context:** A20 proposed "atomic per contact, not all-or-nothing". With transactions available (ADR-002), we can do better at the same cost.
**Decision:** One transaction: find eligible contacts → `updateMany` guarded by `tags: { $ne: tag }` → `insertMany` activities. Missing IDs, already-tagged contacts, and contacts at the 50-tag limit are **reported, not errors**. A real failure (database error) rolls back everything, so the client can retry the whole request safely — it's idempotent.
**Alternatives:** Per-contact updates without a transaction — the read-then-update race could give an activity list that doesn't match what changed.
**Consequences:** Up to 500 documents per transaction, well within MongoDB limits. Larger batches ("select all 2 million") need a background job — documented limitation.

## ADR-010: Frontend state management

**Status:** **Accepted (2026-10-18) — option A. Redux Toolkit is not used.** The assignment does not require it, and nothing in the state analysis below needs it.
**Context:** See the state table in [01-architecture.md §9](01-architecture.md#9-frontend-design). Two pages; the list query belongs in the URL; selection is used only by the list page; the edit form, tags, and timeline are siblings on one detail page. No state is shared across pages except "the list should show fresh data when you come back", which a refetch on mount handles.
**Options:**

| Option | Fits | Cost |
|---|---|---|
| A. `useState`/`useReducer` + custom hooks + API service layer, list query in URL params | All current needs | Small: one generic `useApiRequest` hook |
| B. A + React Context | Only state used by many distant components (for example, toast notifications) | A provider per concern; re-renders all consumers |
| C. Redux Toolkit (slices + async thunks) | Large client state shared by many screens, complex transitions, devtools/time travel | Store, slices, thunks, selectors, provider, test setup. We would hand-write caching and invalidation — rebuilding part of a server-state library |
| D. Redux Toolkit + RTK Query | Server-state caching | Excluded: it's a server-state library, like React Query |

**Recommendation:** **A**, with **B** used only for a small toast/notification context if the UI needs one.
**Revisit if:** more pages share mutable client state, real-time updates arrive over WebSockets and must merge into several views, or an offline mutation queue / undo is added.

## ADR-011: Libraries

**Status:** Accepted — implemented (versions below)
| Need | Choice | Not chosen, and why |
|---|---|---|
| HTTP server | Express 5 | Express 4 needs a wrapper for async errors; Fastify/Nest weren't requested |
| Validation | Zod (backend and frontend) | Joi/Yup — no TypeScript type inference |
| ODM | Mongoose 9 | Native driver — requested stack is Mongoose; we still use raw filters where precision matters |
| HTTP client | Native `fetch` | Axios — unneeded dependency; `fetch` supports `AbortSignal` |
| Forms | `useReducer` + Zod | React Hook Form — five fields; the conflict/draft logic is custom anyway and clearer as explicit state |
| Styling | CSS Modules (built into Vite) | Tailwind/UI kits — extra setup |
| Logging | Small JSON request logger | pino — reasonable choice; add if logging needs grow |
| Tests | Vitest, Supertest, RTL, Playwright, `mongodb-memory-server` | Jest — Vitest shares Vite config and is faster with TypeScript/ESM |

Installed in Phase 2 (2026-10-18): Node 24, TypeScript 6.0, Express 5.3, Mongoose 9.11, Zod 4.6, React 19.3, React Router 8.4, Vite 8.3, Vitest 5.0, ESLint 10. Both packages are ESM (`"type": "module"`); the backend uses `NodeNext` resolution, so relative imports end in `.js`.

## ADR-012: List query state in the URL

**Status:** Accepted — implemented (Phases 9–10); promotes optional item 3 into the MVP
**Decision:** `q`, `company`, `tags`, `sortBy`, `sortOrder`, `page` are read from and written to `useSearchParams`. Invalid values from the URL fall back to defaults.
**Why:** Back button and refresh keep the list view; returning from a contact restores the same page; links can be shared; one source of truth for the query instead of copies in state. React Router already provides it, so it adds no dependency.
**Consequences:** Typing in search updates the URL only after the debounce, with `replace: true`, so history doesn't fill with keystrokes.
