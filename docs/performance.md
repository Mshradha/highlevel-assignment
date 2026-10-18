# List Query Performance — Measurements

**Measured:** 2026-10-18, Phase 5
**Reproduce:** `npm run seed -- --count=100000` into a `*_test` database, then `npm run explain` (both in `backend/`, with `MONGODB_URI` pointing at that database).

## Environment and caveats

- MongoDB Atlas **M0 (free, shared tier)**, MongoDB 8. Network round trip from the dev machine: 7–10 ms.
- **100,000** contacts from the deterministic seed (not millions). Average document 364 bytes.
- One run per query; times vary between runs by several milliseconds on a shared tier. The **keys and documents read** are the reliable signal — they don't depend on hardware or load, and they show how cost grows with collection size.
- `findMs` = server-side execution time from `explain`. `countMs` = wall-clock time including the network round trip.

These numbers show *which plan MongoDB chooses and how much it reads*. They are not a benchmark of throughput or latency under load.

## Results (after the fix described below)

| Query | Matches | Keys read | Docs read | In-memory sort | find ms | count ms | Index used |
|---|---:|---:|---:|---|---:|---:|---|
| Browse, newest first | 100,000 | 20 | 20 | no | 0 | 53* | `createdAt_id` |
| Browse, by name | 100,000 | 20 | 20 | no | 0 | 60* | `lastName_firstName_id` |
| Deep page (offset 9,980) | 100,000 | 10,000 | 20 | no | 7 | 52* | `createdAt_id` + SKIP |
| Company + date sort | 6,319 | 20 | 20 | no | 0 | 14 | `company_createdAt_id` |
| Company + name sort | 6,319 | 20 | 20 | no | 0 | 16 | `company_lastName_firstName_id` |
| Tag + date sort | 16,831 | 20 | 20 | no | 0 | 23 | `tags_createdAt_id` |
| Two tags (AND) + date sort | 3,033 | 114 | 114 | no | 2 | 78 | `tags_createdAt_id` |
| Search `ann` + date sort | 7,616 | 325 | 325 | no | 18 | 22 | `createdAt_id` (walk in sort order, filter) |
| Search `ann` + name sort | 7,616 | 394 | 394 | no | 9 | 23 | `lastName_firstName_id` |
| Search `jo` (broad) | 20,375 | 112 | 112 | no | 9 | 41 | `createdAt_id` |
| Search phone `(415) 5` (rare) | 11 | 13 | 11 | yes (11 docs) | 0 | 11 | OR of `fullName`, `lastName…`, `email_unique`, `phoneDigits` |
| Search + company + tag | 78 | 1,162 | 1,162 | no | 40 | 239 | `company_createdAt_id` |

\* The API doesn't run this count: with no filter it uses `estimatedDocumentCount` (collection metadata), measured at **11 ms vs 52 ms** for an exact count — and the exact count grows linearly with the collection.

**No query does a collection scan.** Every browse/filter page reads exactly as many index entries as it returns (20 → 20), because each filter + sort combination has a compound index in the right order (equality fields first, then the sort fields).

## Finding: partial indexes were silently unusable for search

The first measurement showed every search walking the sort index and filtering documents one by one:

| Search | Matches | Keys read **before** | Keys read **after** | find ms before → after |
|---|---:|---:|---:|---:|
| Phone `(415) 5` (rare) | 11 | **100,000** | **13** | 490–1,506 → 0–1 |
| `zoë mü` (rare) | 20 | 32,145 | 60 | 215 → 1 |
| `ann` (common) | 7,616 | 325 | 325 | unchanged |

**Cause.** `email_unique` and `phoneDigits` are *partial* indexes (`{ $type: "string" }`). MongoDB only uses a partial index when the query provably satisfies the index's filter, and it can't infer "is a string" from a regex. So the `email` and `phone` branches of the search `$or` had no usable index. If any branch of an `$or` lacks an index, the planner can't combine the branch indexes, and its only remaining option was to walk the sort index and test every document. That works when matches are common (the first 20 turn up quickly). When they're rare, it reads the whole collection — a collection scan in disguise, growing linearly with the data.

**Fix.** The search branches repeat the index filter: `{ email: { $type: "string", $regex: /^…/ } }` (same for `phoneDigits`). Now every branch is indexable, and the planner's trial run picks per query: combine the branch indexes for rare matches (then sort the few results in memory), or walk the sort index for common ones. A unit test (`contact.query.test.ts`) guards the `$type` condition.

**Lesson.** The 300-contact demo data and every functional test passed with the slow plan; only measuring at scale exposed it.

## Index cost

| | Size (100k contacts) |
|---|---:|
| Documents | 34.7 MB (14.3 MB compressed on disk) |
| All 10 indexes | **91.8 MB** |
| `tags_createdAt_id` / `tags_lastName_firstName_id` | 18.4 / 16.5 MB (one entry per tag, so the largest) |
| `email_unique` | 10.6 MB |
| Each other index | 5–9 MB |

The indexes are 2.6× the data. Every insert or profile change updates them, and they compete for RAM with the data. This is the price of serving every filter + sort combination without in-memory sorts. In production, `$indexStats` would show which indexes are actually used, and unused ones would be dropped.

## Known limits and what would change at larger scale

| Limit | Why | What to do if measurements demand it |
|---|---|---|
| **Search + filter combinations** read every contact of that company (or tag) and test each (1,162 reads for 78 matches; the count took 239 ms). | No index can serve "prefix on name AND company AND tag AND sorted" at once. | Acceptable at this scale. Grows with company size, not total size. Beyond that: a search engine (Atlas Search / Elasticsearch). |
| **Broad searches** (`jo`: 20,375 matches) must count every match. | `countDocuments` reads one index entry per match. | Cap the count ("10,000+") or show "more results" instead of a total. |
| **Deep pages** read every skipped index entry (10,000 for page 500). | Offset pagination. | Bounded by `maxOffset` = 10,000. Keyset pagination (`?after=<last sort values>`) costs the same for any page. |
| **Search is prefix-only and accent-sensitive**: `ann` doesn't find "Joanne"; `jose` doesn't find "José" (`jos` does). | Prefix regexes on lowercase fields; no diacritic folding. | Store accent-folded search fields, or use a search engine for substring/fuzzy matching. |
| **Name sort is byte order**: "Müller" sorts after "Z…"; contacts without a last name sort first. | Lowercase copies compared as bytes, not with a locale collation. | Collation-aware indexes (`{ locale: "en", strength: 1 }`) — every query must then specify the same collation. |
| **The plan cache** reuses a plan per query *shape*, not per value; a plan picked for a common search could be reused for a rare one. | MongoDB caches winning plans. | MongoDB re-plans when a cached plan performs much worse than when it was cached; worth watching in the slow-query log. |
| **M0 shared tier**: absolute timings are not representative of a dedicated cluster. | Shared resources. | Re-measure on production-like hardware before making capacity decisions. |
