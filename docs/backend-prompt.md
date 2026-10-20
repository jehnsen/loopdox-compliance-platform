# Build prompt: LoopDox backend (FastAPI + PostgreSQL)

> Paste everything below the line into a fresh coding-agent session started in an **empty directory** for the backend repo (e.g. `loopdox-api/`). It assumes the agent can read the frontend repo at `FRONTEND_REPO` (set below).

---

## Role

You are a senior backend engineer building the production API for **LoopDox**, a multi-tenant B2B compliance SaaS for Philippine companies (Data Privacy Act of 2012 / NPC rules). The **frontend already exists and is finished through milestone M8**. It defines the API contract, and the backend implements it. You are not designing the API; you are making an existing contract real, with a real database, real auth, and the same behaviour the frontend's mock API already has.

`FRONTEND_REPO` = `D:\xampp\apache\bin\FE\loopdox-compliance-platform` (read-only for you, except where this prompt says to add a script there).

## Sources of truth, in priority order

Read these before writing any code, and go back to them whenever you're unsure. Don't guess when a file can answer the question.

1. **`FRONTEND_REPO/docs/api-contract.md`**: every endpoint, query parameter, body, response, status code, error code, and business rule. It's your spec.
2. **`FRONTEND_REPO/lib/api/types.ts`**: the exact TypeScript type of every request and response (about 2,000 lines). Field names, optionality, and nullability here are binding.
3. **`FRONTEND_REPO/mocks/`**: the **reference implementation**. `mocks/handlers/*.ts` contains the behaviour for each endpoint, `mocks/router.ts` + `mocks/dispatch.ts` contain the request pipeline, `mocks/http.ts` contains errors, `paginate`, and `checkVersion`, and `mocks/seed/*` contains the demo data. When the contract is silent, do what the mock does.
4. **`FRONTEND_REPO/docs/decisions.md`** (D1–D181): why the mock behaves as it does. Many rules live only here (e.g. D40 document projection, D65 the 72-hour clock, D95 attention ranking, D127 control status, D145–D152 Ask grounding).
5. **`FRONTEND_REPO/lib/schemas/*.ts`**: the zod validation rules and **user-facing error messages**. Port the rules and the message text exactly. The UI shows `fields` messages under the form inputs.
6. Shared rule tables the backend must mirror exactly:
   - `lib/auth/permissions.ts`: role → permission map, `isAuditorOnly`
   - `lib/entitlements.ts`: tier → feature map, Starter Ask cap (100/month)
   - `lib/links.ts`: `LINK_RELATIONS` (which record stores each link) and `linkPermission`
   - `lib/ai.ts`: assessment questions and weights, `suggestedRisk`, recognizers, guardrails
   - `lib/evidence.ts`: connector checks and which control each one feeds
   - `lib/privacy.ts`, `lib/security.ts`, `lib/risk.ts`, `lib/overview.ts`, `lib/countdown.ts`: thresholds and derived states
   - `lib/markdown/toc.ts`, `lib/markdown/sections.ts`: heading anchors (github-slugger) that Ask citations must match
7. `FRONTEND_REPO/docs/spec.md`: product context, and sections 7 and 9 for Settings (M9), which isn't in the contract yet.

If two sources disagree, the contract wins over the mock, and the mock wins over the spec. Record every judgement call in `docs/decisions.md` in the backend repo (numbered `B1`, `B2`, …, with a "Why" column, the same format as the frontend's).

## How the frontend calls you

- The browser never calls FastAPI. The Next.js BFF (`app/api/v1/[...path]/route.ts`, `app/api/auth/[...action]/route.ts`, `lib/server/backend.ts`) forwards `/api/v1/*` to `API_BASE_URL` (default `http://localhost:8000/api/v1`) when `API_MODE=live`, attaching `Authorization: Bearer <access JWT>` from an httpOnly cookie.
- The BFF forwards **request** headers `content-type`, `accept`, `if-match`, `x-request-id`, `last-event-id`, `x-forwarded-for`, and never forwards cookies.
- The BFF passes back **only these response headers**: `content-type`, `content-disposition`, `cache-control`, `retry-after`, `etag`, `allow`, `x-request-id`, `x-content-type-options`. Anything else you set is dropped.
- **A 401 from you makes the BFF clear the session cookies and sign the user out.** Return 401 only for missing, invalid, or expired tokens and bad login credentials. Never use it for anything else (e.g. a wrong token in a reset link is 422 `invalid_token`).
- The BFF refreshes tokens by calling `POST /auth/refresh` from two places (`proxy.ts` on page loads and the API route on a 401), so **the same refresh token can arrive several times within a second**. See the auth section.
- SSE (`POST /orgs/:org/ask`) is streamed straight through. Send `Content-Type: text/event-stream` and flush each event immediately.
- There's no CORS, because only the BFF calls you. Don't enable CORS.

## Tech stack

Check current stable versions (`uv add` resolves them) and pin exact versions.

| Concern | Choice |
| --- | --- |
| Language / runtime | Python 3.13, `uv` for dependencies and scripts |
| Web | FastAPI, Uvicorn (Gunicorn with Uvicorn workers in production) |
| Models / validation | Pydantic v2 (+ `pydantic-settings` for config) |
| Database | **PostgreSQL 17+**, SQLAlchemy 2.x (async, `asyncpg`), Alembic migrations |
| Extensions | `pg_trgm` (search), `citext` (emails), `pgvector` (optional, Ask retrieval) |
| Auth | PyJWT (or joserfc), `argon2-cffi` (Argon2id passwords) |
| Crypto | `cryptography` (Fernet / MultiFernet for provider keys) |
| Files | Storage interface: local disk in dev, S3-compatible (MinIO locally) in production |
| Spreadsheets | `openpyxl` (XLSX read/write), stdlib `csv` |
| Markdown | `markdown-it-py` (heading extraction for Ask passages and anchors) |
| Jobs / scheduler | One worker process using a Postgres-backed queue (e.g. `procrastinate`) or APScheduler with a Postgres advisory lock. Don't add Redis unless you need it. |
| Email | SMTP with an outbox table. Mailpit in dev. |
| Testing | `pytest`, `pytest-asyncio`, `httpx.AsyncClient`, real Postgres (docker compose or `testcontainers`), `time-machine` for the clock |
| Quality | `ruff` (lint + format), `mypy --strict` (or pyright strict) |
| Local env | `docker-compose.yml`: postgres, mailpit, minio |

## Project structure

```
loopdox-api/
  pyproject.toml  uv.lock  alembic.ini  docker-compose.yml  .env.example  README.md
  docs/decisions.md
  contract/                 JSON synced from the frontend (see "Contract sync")
  alembic/versions/
  app/
    main.py                 app factory, routers under /api/v1, exception handlers
    core/                   config, db session, clock, ids, refs, errors, pagination,
                            casing/serialisation, timezones, logging (with redaction), storage, email
    auth/                   tokens, passwords, login/refresh/logout/reset/invites, rate limiting
    tenancy/                OrgCtx dependency: org + membership + roles + permission + feature gate
    audit/  notifications/  search/  links/  files/  overview/
    modules/
      documents/            models.py  schemas.py  service.py  router.py  (same layout everywhere)
      controls/  privacy/  security/  evidence/  ask/  questionnaires/  ai/  members/
    jobs/                   scheduler + deadline sweeps + connector runs + email sender
  scripts/  seed.py  contract_check.py
  tests/
```

Keep routers thin. Put business rules in `service.py`, where they can be unit-tested without HTTP.

## Cross-cutting rules (get these right once, in `core/`)

**JSON shape**
- camelCase on the wire. Pydantic models use `alias_generator=to_camel`, `populate_by_name=True`, and responses serialise `by_alias=True`.
- Match `types.ts` exactly. A field typed `x: T | null` must **always be present**, as `null` when empty. A field typed `x?: T` may be omitted. Don't use `response_model_exclude_none`.
- Timestamps are ISO 8601 UTC **with milliseconds and `Z`**: `2026-10-14T02:30:00.000Z`. Python's default `isoformat()` (`+00:00`, microseconds) is wrong, so write one serializer and use it everywhere. Calendar dates (`effectiveDate`, `nextReviewDate`, `receivedAt`/`dueAt` on DSRs, `renewsAt`, …) are `YYYY-MM-DD` in the **tenant's timezone**. Check each field's type in `types.ts`.
- IDs are strings `"{prefix}_{16 hex}"`, matching `newId()` in `mocks/store.ts` (`doc_…`, `usr_…`). Store them as `text` primary keys so seeded IDs like `usr_jehnsen` and `doc_itd_006` import unchanged.

**Errors**: always the envelope `{ "error": { "code", "message", "fields"? } }`.
- Override FastAPI's `RequestValidationError` handler to return **400** `validation_error`. `fields` maps **camelCase dotted paths** (`risks.0.likelihood`) to the zod message text, with the `body`/`query` prefix removed from `loc`. Unparseable JSON is 400 too.
- Unknown path: 404 `not_found`. Known path with the wrong method: **405** `method_not_allowed` with an `Allow` header. Unhandled exception: 500 `internal_error` with no stack or internals in the message.
- Domain errors use one exception class (like the mock's `HttpError`). Use the codes from the contract table only.
- Error messages are user-facing sentences in the same tone as the mock's (plain, specific, active voice). Copy the mock's wording where one exists.

**Tenancy and access**: one FastAPI dependency, a port of `resolveOrgCtx` in `mocks/router.ts`, used by every `/orgs/:org/...` route:
1. Look up the org by slug. If it's missing, **or the caller has no active membership**, return 404 `not_found`, so slugs can't be probed (D17).
2. Expired guest membership: 403 `forbidden` (D18).
3. Feature not in the tier: 403 `feature_not_in_plan`, message "X is included in the Pro plan." **The plan is checked before the role** (D33).
4. Missing permission: 403 `forbidden`.
5. Give the handler `ctx.org`, `ctx.user`, `ctx.roles`, `ctx.can(p)`, `ctx.require(p)`, and `ctx.today` (today in the org's timezone).

Every query is scoped by `org_id`. Put the scoping in the repository layer so it can't be forgotten. Add Postgres row-level security as defence in depth in the hardening milestone.

**Visibility rules are server-side and easy to miss.** Write a test for each one:
- Documents: callers without `policies.read_drafts` get the **projection** (approved version only, shown as approved). Never-approved and retired documents are 404 to them. Version endpoints return 404 above the approved version (D40). The same projection applies in search, overview counts, control `documentIds`, links, the audit pack, and Ask.
- Privacy: auditor-only members see only finalised records (D80).
- DSR requester name and contact are **masked in every response** (mask formats in the contract), never appear in search, titles, link titles, or audit details, and are revealed only through `POST /sensitive/reveal`, which is audited with the field name and never the value.
- Secret records and connectors **refuse** bodies that carry `value`, `secret`, `password`, `token`, `apiKey`, `key` (connectors also `clientSecret`) with 400 on that field. Refuse them; don't silently ignore them (D117, D135).
- Provider keys are never returned, logged, audited, or echoed in an error. Only `last4` leaves the server (D178). BYOK refuses `key`.
- AI events and stats hold **masked samples only**. A raw prompt never reaches LoopDox's database, logs, or search.
- Links, search, overview, and Ask filter targets to what the caller can see, using the same visibility code as the detail endpoints. Write one `visible(ctx, type, id)` registry, like `mocks/records.ts`, and reuse it everywhere.

**Lists**: one helper that implements `page` (1-based), `pageSize` (default 25, max 200), `sort` (`-field` for descending), `q`, and comma-separated filters (any of), and returns `{ items, page, pageSize, total }`.
- Whitelist sortable fields per endpoint. Unknown sort fields fall back to the default. Nulls sort last (see `compare` in `mocks/http.ts`). Text sorts are **natural** (`A.5.2` before `A.5.10`): store a sort key or use an ICU collation with numeric ordering.
- Do it in SQL for anything unbounded (documents, evidence, audit events, AI events, notifications, Ask threads). Small per-org registers with **derived** filters (`dueState`, `reviewState`, `renewalState`, `warning`) may filter and sort the derived fields in Python after an org-scoped query, but only through the shared helper, so it can move to SQL later.

**Optimistic concurrency**: every editable record has `version int`. Writes check `ifVersion` atomically (`UPDATE … WHERE id = :id AND version = :if_version RETURNING …`; no row means 409 `version_conflict`, or 404 if the record is gone). Every successful write increments `version`, except where the contract says it doesn't (reorder, D47). A missing `ifVersion` where it's required is 400. Questionnaire rows have their own version (D160).

**Display references** (`ITD-…` is user-chosen; `PA-001`, `PIA-001`, `AGR-001`, `RISK-001`, `SYS-001`, `AR-001`, `SCR-001`, `CHG-001`, `ADR-001`, `AI-001`, `AIA-001` per org; `DSR-YYYY-NNNN`, `INC-YYYY-NNNN` per org per year in the tenant timezone): allocate them from a `ref_counters(org_id, kind, year)` table with `INSERT … ON CONFLICT DO UPDATE … RETURNING` inside the write's transaction, so concurrent creates never collide. Initialise counters from seeded data. Detail routes accept the ID **or** the reference.

**Time**: inject a `Clock` dependency (`now()` in UTC) and never call `datetime.now()` directly. Compute "today" in the org's timezone with `zoneinfo`. Elapsed-time rules (breach deadline = discovery + 72 h, emergency change review = deploy + 48 h) use UTC arithmetic. Calendar rules (DSR due, review dates, renewals, "due soon within N days") use tenant-local dates. Port `lib/countdown.ts` and the threshold helpers, and test the boundaries (exactly 24 h, exactly 6 h, a DST timezone such as America/New_York, as the frontend does).

**Audit log**: an append-only `audit_events` table, written **in the same transaction** as the change it records. Use the action names in the contract's "Audit actions" lists. `details` never holds secrets, key material, requester identities, or raw prompts. Take `ip` from `x-forwarded-for`, trusting only the BFF hop.

**Notifications**: insert them in the same transaction as the event (approval requested/decided, DSR assigned, breach reported, connector failed, …) per the contract and D50. Add a **scheduled deadline sweep** (the mock skipped this, see D106) for `deadline_dsr`, `deadline_breach`, `deadline_review`, `deadline_rotation`, `deadline_renewal`, deduplicated by `(user, type, target, threshold)`. Email goes through an outbox that the worker sends. The Settings milestone adds per-user preferences.

**Files**: a storage interface (`put`, `get`, `delete`) with local and S3 drivers.
- `POST /files` and `POST /evidence`: 10 MB max; PDF, PNG, JPEG, text, CSV, DOCX, XLSX. **Check the type from the content** (magic bytes, plus zip structure for DOCX/XLSX), not from the declared type or extension.
- `POST /documents/images`: PNG, JPEG, GIF, WebP up to 5 MB, **never SVG**, sniffed with the same signatures as `sniffImageType` in `lib/files.ts`. Store the sniffed type. Serve with exactly the four headers the contract lists.
- Downloads set `Content-Disposition: attachment` (RFC 6266 `filename*`) and `X-Content-Type-Options: nosniff`.

**Search** (`GET /orgs/:org/search`): every word must match (case-insensitive substring) across a record's ID, title, and text. Rank exact ID, then ID, then title, then text. Group order is fixed, `total` is given per group, `type` and `limit` filters apply, and snippets mark matches with `«…»` and never contain HTML. Use `pg_trgm` GIN indexes with `ILIKE` per word (not `tsvector`, which stems and so changes what matches). Port the source registry from `mocks/handlers/search.ts`.

**Logging**: structured JSON, with a request ID (honour `x-request-id`). A redaction filter drops `password`, `token`, `key`, `secret`, `apiKey`, `authorization`, `refreshToken`, requester fields, and prompt text. Never log request bodies on auth, keys, secrets, connectors, sensitive-reveal, or Ask.

## Auth

Implement the contract's Auth section exactly. `POST /auth/mock-login` is mock-only (D13), so don't implement it.

- Access JWT: 15 min (`expiresIn: 900`), claims `sub`, `typ: "access"`, `iat`, `exp`, `jti`, `iss`. Refresh token: 12 h (`refreshExpiresIn: 43200`), opaque random, **stored hashed** in `refresh_tokens` with a family ID.
- **Rotation with a grace window.** Each refresh issues a new pair and marks the old token as replaced. If an already-replaced token is presented **within 30 seconds** of its replacement, return a valid pair (the BFF's parallel refreshes cause this). Outside the window, treat it as token reuse: revoke the whole family and return 401.
- `POST /auth/logout` revokes the family. A password reset revokes all of the user's families.
- Passwords: Argon2id, 12–200 characters (D15). Login failures return the same 401 `invalid_credentials` whether or not the email exists, with a constant-time check.
- Rate limiting: login, forgot-password, and invite accept return **429 `rate_limited` with `Retry-After`** (per IP and per email). Use a Postgres table or an in-process limiter, and record the choice as a decision.
- Forgot password always returns 202. Reset tokens are single-use, stored hashed, valid for 1 hour, and emailed as `{APP_URL}/reset-password?token=…`.
- `GET /me?org=` follows the contract and D21. `usage` covers Ask questions this calendar month in the tenant's timezone (D25), users, storage MB, and connectors (D136). `apiMode` is always `"live"`. Memberships whose guest access has expired aren't listed.

## Module notes

The contract has the details. These are the parts that are easy to get wrong.

**Documents (M2).** Versions are immutable rows. Only title or body changes create a version (D42). `requiresApproval: false` publishes immediately (D43). Approve sets `effectiveDate` = today in the tenant timezone and `nextReviewDate` = that date + `reviewCycleMonths`. Reject needs a note. Restore creates a new version. Delete only works on never-approved documents with no children. Reorder doesn't bump `version`. Acknowledgements are per approved version (D48). `export` returns CSV with the contract's columns and filename. `next-id` follows D51. Write `WorkflowEvent` and audit rows for every transition. `reviewState` uses the org's `reviewReminderLeadDays`.

**Privacy (M3).** DSR due date = received + `org.settings.dsrResponseDays` (calendar). Status only moves forward. Incidents: `notificationDeadline` = `discoveredAt` + 72 h whenever personal data is involved, recomputed when either input changes. Follow the PATCH rules exactly (the triage fields move `reported` to `triage`, status moves forward only, closing has preconditions, a closed incident only accepts `postIncidentReview`). Port notice drafting from `mocks/notices.ts` (plain text, `[bracketed]` gaps, D72). Editing notices clears the sign-off (D70). Derive processing-record `warnings`, `piaId`, and agreement `processingActivityIds` (D83, D84). Allow one registration per org.

**Links.** Store each link only on the owner side, per `LINK_RELATIONS`, as columns or arrays on the owner, or one `record_links` table keyed by relation. Pick one approach and document it. `GET /links` returns both directions, including empty groups, leaves out types outside the plan, and computes `linkable` per relation (managed relations are never linkable). POST and DELETE are idempotent, bump the owner's `version`, take no `ifVersion`, and write `<ownerType>.linked|unlinked` audit events.

**Overview (M4).** One computation returns the whole dashboard (D93). Port the attention source registry from `mocks/handlers/overview.ts` with its ranking (class, then overdue, then soonest; D95), tones, badges, and per-role filtering (D98, D101). Section pages are excluded from document counts (D99).

**Security (M5).** Access review sign-off is one transaction: apply the decisions to the grants, stamp `lastReviewedAt`, create **one evidence item on control A.5.15**, re-judge that control's status, and write the audit event. Secrets' `nextDueAt` is stored. Supersede creates the new accepted ADR and marks the old one superseded in one transaction. Deleting a system returns 422 listing what still references it.

**Evidence (M6).** Evidence is insert-only. After **every** evidence write, re-judge the control: the newest pass or fail by `collectedAt` decides, `info` never counts, and `not_applicable` is sticky (D127). Connectors: one row per provider per org, and a provider **adapter interface** (`run(connector) -> list[CheckResult]`). Ship a `simulated` adapter that reproduces the mock's results so dev and tests are deterministic. Real GitHub, Azure, Google Workspace, and Hostinger adapters (OAuth and API calls, credentials in a secrets backend, never in the database in clear) are a later milestone behind the same interface. Enforce `plan_limit_reached` at Pro's limit of 3 connectors. Audit pack: `periodStatus` is judged from evidence inside the period, and policies appear at their approved version only. **`/audit-pack/export` returns a zip** (register CSV plus the evidence files).

**Ask (M7)**, the hardest part:
- Validate the request, check plan and role rules (D149), and **count usage atomically before streaming**. Use `UPDATE usage … SET n = n + 1 WHERE n < cap RETURNING n`; if no row comes back, return 403 `plan_limit_reached` as JSON. Every accepted question counts (D150).
- Retrieval: split the approved policy versions (or, with `asOf`, the version in force at the end of that tenant-local day, D152) into passages under headings, as `mocks/ask/policies.ts` does. Heading anchors must equal **github-slugger** output on the rendered heading text (lowercase, strip punctuation per its regex, spaces become `-`, duplicates get `-1`, `-2`, …). Port it and test it against the frontend's `lib/markdown/toc.ts` on every seeded policy (see Contract sync). Citation `href` follows the contract (current version: `/:org/policies/:id#anchor`; otherwise `/versions/:v#anchor`). Records and Impact routes use the visibility registry and the link graph. Port the routing heuristics from D148.
- Generation, behind an `AnswerEngine` interface with two implementations:
  - `extractive` (default in dev and tests): port the mock engine. It quotes matching passages, one cited line each, so the output is deterministic.
  - `llm`: calls the model **through the VisorShield proxy** (`VISORSHIELD_BASE_URL`; every Ask call goes through it, spec 9.5). Default `ASK_MODEL=claude-sonnet-5-5`, with the provider and model in config. The prompt gives the model only the numbered passages and requires a `[n]` marker on every statement. **Validate the output.** Drop markers that don't refer to a retrieved passage, and if no valid citation remains, discard the text, set `grounded: false`, and stream the "couldn't find" answer with suggestions.
- Stream format: the events `route`, `citation`, `token`, `done`, and `error` from the contract, as `event: <name>\ndata: <json>\n\n`. A `citation` must be sent **before the first token that cites it**, so buffer the LLM output until a `[n]` marker resolves. Send a `: ping` comment every 15 s. If the client disconnects, stop generating, keep the usage count, and save nothing partial. Save the user and assistant messages (with citations, route, and grounded flag) when `done` is sent. A new thread's title comes from the first question. Threads are private to the user who asked (D153).

**Questionnaires (M7).** Parse the first worksheet. The header is the first non-empty row. Limits are 500 rows and 10 MB. Suggested mapping follows D157. Draft answers quote approved policy text with citations, or leave the answer empty with status `needs_input` (D159). Export writes only the answer column, strips `[n]` and bold markers, preserves every other cell and the sheet name, and uses the filename from the contract with `filename*`. Exports are audit-logged.

**AI governance (M8).** Approval and rejection come only from an assessment's `decide` (D171). `suggestedRisk` uses the weights in `lib/ai.ts`; assert equality in a test. Profiles: four per org. Validate recognizer and guardrail IDs. Topics are 2–80 characters, at most 30, de-duplicated case-insensitively. `POST /ai/profiles/:id/test` stores and logs **nothing**. Forward it to the proxy's test endpoint when one is configured; otherwise use a local regex implementation of the recognizers (port the mock's). Keys: Fernet via `MultiFernet` with keys from env, so keys can be rotated. The Azure Key Vault storage driver sits behind an interface (stubbed in dev). Stats and events come from VisorShield. Add a **service-authenticated ingestion endpoint** for the proxy (`POST /internal/visorshield/{events,daily-stats,status}`, outside `/orgs`, with its own token). As defence in depth, run the recognizers over each incoming `maskedSample`, refuse samples that still contain a match, and count those rejections. `GET /ai/stats` limits: 90 days max, `previous` period, `topBlocked`. Facets endpoint.

**Settings (M9, not in the contract yet).** Implement `PATCH /orgs/:org`, members (list, change roles, remove, guest expiry), `POST /orgs/:org/invites`, notification preferences, and the org audit log with export, following spec sections 7 and 9.9 and the existing conventions. Mark them **provisional** in your README, and write their contract entries in the frontend's style in `docs/contract-additions.md` for the frontend team to merge. The last owner can't be removed or demoted. `auditorGuests` is gated by plan.

## Database

- One Alembic migration per milestone, reviewed by hand (no autogenerate drift). `org_id` is on every tenant table, with composite indexes that start with `org_id`. Use foreign keys everywhere; most deletes are restricted because the business rules forbid them anyway.
- Use `jsonb` for genuinely nested value objects that are always read whole (PIA risks, data flows, notice drafts, connector checks, AI assessment questions, processing-record recipients). Use real columns or tables for anything filtered, sorted, joined, or linked.
- Every entity has `id, org_id, created_at, updated_at, created_by, updated_by, version`, plus `sample boolean default false` (seed data sets it, and the frontend shows a banner for it).
- Name columns in snake_case. API names are camelCase via Pydantic aliases.

## Seed data and contract sync

Parity with the mock is how you prove you're done, so reuse the frontend's own data and rules instead of retyping them.

1. **Add one script to the frontend repo**, `FRONTEND_REPO/scripts/export-contract.ts` (run with `pnpm tsx`). It writes into `loopdox-api/contract/`:
   - `seed.json`: the output of `seedDatabase(new Date())` from `mocks/seed/index.ts`
   - `permissions.json`, `entitlements.json`, `link-relations.json`, `ai-catalog.json` (questions with weights, recognizers, guardrails), `connector-checks.json`
   - `anchors.json`: for every seeded policy version, the heading anchors the frontend computes
   - `schemas/*.json`: JSON Schema for every response type in `types.ts` (e.g. with `ts-json-schema-generator`)

   This is the only change you make in the frontend repo. Tell the user about it in your summary.
2. `scripts/seed.py` loads `seed.json` into Postgres. It maps the mock's storage shapes (`MockDsr.requester`, `MockDocumentVersion`, `MockQuestionnaire`, …) to your tables, hashes the demo password `loopdox-demo`, and initialises the ref counters. Seed timestamps are relative to the moment `seed.json` was generated, so regenerate it before seeding a demo. `uv run seed --reset` drops and reseeds.
3. Tests load the `contract/*.json` rule tables and assert that your Python constants equal them, so any drift fails CI.
4. A **contract test** validates every response in the test suite against `contract/schemas`.

## Testing

- Tests run against real Postgres. Each test runs inside a transaction that is rolled back, the clock is frozen with `time-machine`, and the fixtures load the seed.
- For each endpoint, test the happy path, every documented error (400 fields, 403 `forbidden` vs `feature_not_in_plan` vs `plan_limit_reached`, 404 for non-members, 409, 422), and the visibility rules for staff, auditor, and Starter tenants.
- Add a **permission matrix test**: for every route × role × tier, check the expected status, generated from `permissions.json` and `entitlements.json`.
- Add a **secret leakage test**: create a provider key, a secret record with a refused value, and a DSR requester, then scan every response body, the audit table, the notifications table, and captured logs for the raw values. Do the same for AI events and raw PII (as the frontend's D178 and D179 tests do).
- Ask: the SSE event order, citation-before-token, `grounded: false` with no citations, `asOf`, the cap at 100 on Starter, and `stream_error` handling.
- **End to end:** run the frontend's Playwright suite with `API_MODE=live API_BASE_URL=http://localhost:8000/api/v1`. The suite resets data through the mock-only `/api/mock/reset`, so add `POST /api/v1/__test__/reset` (and `__test__/usage`, `__test__/ai-proxy`, matching the mock ones), mounted only when `ALLOW_TEST_ENDPOINTS=1`. Note in your summary that the frontend's `app/api/mock/*` routes need a small change to forward to these in live mode. Don't make that change yourself.

## Milestones

Work in this order. Finish a milestone, run `ruff`, `mypy`, and `pytest` plus that milestone's contract tests, fix any failures, then **stop and summarise** what you built, how to try it (seeded user and endpoint), test results, and new decisions. Then continue.

| # | Scope | Done when |
| --- | --- | --- |
| B0 | Repo, docker compose, config, db, Alembic, error envelope, casing and timestamp serialisation, clock, IDs, refs, list helper, OrgCtx, contract sync, seed loader | `contract_check` passes; seed loads; 404/405/400 envelopes are tested |
| B1 | Auth (login, refresh with grace window, logout, forgot/reset, invites), `/me`, orgs, members list, notifications, audit events, files | The frontend in live mode signs in as every seeded user, switches orgs, and the auth and shell Playwright specs pass |
| B2 | Documents, versions, workflow, acknowledgements, images, export, controls (read) | `policies.spec.ts` passes live |
| B3 | Privacy registers, links, sensitive reveal, risks (short form) | `privacy.spec.ts` passes live; 72-hour clock boundary tests pass |
| B4 | Overview, search | `overview.spec.ts` passes for the M3/M4 attention sources (secret, access-review, and connector sources come in B5 and B6) |
| B5 | Security registers, access reviews with evidence, secret and access-review attention sources | `security.spec.ts` passes |
| B6 | Evidence, connectors (simulated adapter), connector attention source, audit pack (zip export), scheduler with deadline sweeps and email outbox | `evidence.spec.ts` passes; attention list matches the seed (9 items for the admin, D137) |
| B7 | Ask (extractive engine first, then LLM via VisorShield), questionnaires | `ask.spec.ts` and `questionnaires.spec.ts` pass with the extractive engine; LLM grounding validation is unit-tested with a fake model |
| B8 | AI governance, VisorShield ingestion | `ai-governance.spec.ts` passes; leakage tests pass |
| B9 | Settings endpoints (provisional), RLS, rate limits, security headers, OpenAPI cleanup, Dockerfile, health and readiness endpoints, README | The full frontend Playwright suite passes live; `docs/contract-additions.md` is written |

## Out of scope

The VisorShield proxy itself, real connector OAuth flows (adapter interface only, until a later milestone), payments, the marketing site, and any data sharing between organisations. Don't change the frontend, except for the export script in "Contract sync".

## Working rules

- Strict typing: no `Any` except in narrow adapter code with a comment explaining why.
- Never invent behaviour that contradicts the contract. If something is unspecified, do what the mock does. If the mock doesn't cover it, choose the simplest option consistent with the contract and record it as a `B` decision.
- Keep `README.md` current: setup, env vars (`DATABASE_URL`, `JWT_SECRET` or keys, `FERNET_KEYS`, `APP_URL`, `SMTP_*`, `STORAGE_*`, `VISORSHIELD_BASE_URL`, `VISORSHIELD_INGEST_TOKEN`, `ASK_ENGINE`, `ASK_MODEL`, `ALLOW_TEST_ENDPOINTS`), how to seed, how to run the frontend against the backend, and a folder map.
