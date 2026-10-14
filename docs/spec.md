# LoopDox frontend — build spec

> Source of truth for the frontend build. Where something is unspecified, choose the simplest option consistent with this document and record it in `docs/decisions.md`.

## Role and working rules

You are a senior frontend engineer building a production-grade, multi-tenant B2B SaaS frontend.

- Build **only the frontend** in this repo. The backend (FastAPI) is built separately. Until it exists, the frontend runs against a **mock API** that lives inside this repo (section 6) and matches the API contract exactly (section 7).
- Work in the milestone order in section 13. Finish a milestone, run its checks, then stop and summarise what you built before starting the next.
- TypeScript strict mode everywhere. No `any` except in narrow, commented adapter code.
- Never invent product behaviour that contradicts this document. When something is unspecified, choose the simplest option consistent with it and note the decision in `docs/decisions.md`.
- Keep `README.md` current: setup, scripts, env vars, mock mode, folder map.

---

## 1. Product summary

LoopDox is one web app where a company's **DPO** and **CTO** run their compliance work:

- **Policies:** policy library with versioning, approval workflow, review dates, staff acknowledgement.
- **Privacy (DPO):** records of processing, privacy impact assessments (PIA), data subject requests (DSR), breach and incident log with a 72-hour notification clock, client/vendor agreements, NPC registration, training records.
- **Security (CTO):** asset and access inventory, quarterly access reviews, key/secret rotation tracker (metadata only), change log, risk register, architecture decision records.
- **Evidence:** controls mapped to frameworks, evidence collected by scheduled connectors or uploaded, an auditor view.
- **Ask:** a RAG assistant that answers from approved policies and the registers, always with citations. Also drafts answers to client security questionnaires.
- **AI Governance (Premium):** management UI for VisorShield, 3rdLoop's AI governance proxy: AI inventory, AI risk assessments, policy profiles, provider keys, proxy statistics as evidence.

Market: Philippine companies (law firms, clinics, schools, cooperatives, BPOs, LGUs) that must comply with the **Data Privacy Act of 2012 (RA 10173)** and **National Privacy Commission (NPC)** rules. Default timezone **Asia/Manila**, currency **PHP (₱)**, language **English**.

---

## 2. Tech stack

Use current stable versions; check with `npm view <pkg> version` before installing and pin exact versions in `package.json`.

| Concern         | Choice                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------- |
| Framework       | Next.js (latest stable, App Router, React Server Components), React 19, TypeScript strict         |
| Styling         | Tailwind CSS v4 (CSS-first config with `@theme` in `app/globals.css`)                             |
| UI primitives   | shadcn/ui (Radix based), generated into `components/ui` and restyled to our tokens                |
| Icons           | lucide-react                                                                                      |
| Server state    | TanStack Query v5                                                                                 |
| Tables          | TanStack Table v8 (server-side pagination, sort, filter)                                          |
| Forms           | react-hook-form + zod (schemas in `lib/schemas`, shared with the mock API)                        |
| Dates           | date-fns + date-fns-tz; store ISO 8601 UTC, display in the tenant's timezone                      |
| Markdown editor | CodeMirror 6 (`@uiw/react-codemirror` + `@codemirror/lang-markdown`)                              |
| Markdown render | react-markdown + remark-gfm + rehype-slug + rehype-sanitize (strict schema)                       |
| Diff            | `diff` (jsdiff) for line diffs                                                                    |
| Charts          | Recharts                                                                                          |
| Command palette | cmdk (via shadcn `Command`)                                                                       |
| Toasts          | sonner (via shadcn)                                                                               |
| Testing         | Vitest + Testing Library (unit/component), Playwright (end-to-end), axe-core (a11y in Playwright) |
| Lint/format     | ESLint (next config + typescript-eslint strict), Prettier, `tsc --noEmit` in CI                   |
| Package manager | pnpm                                                                                              |

Do not add other UI kits, CSS-in-JS, or state libraries (no Redux/Zustand). Local UI state uses React state; server state uses TanStack Query; URL state (filters, tabs, pagination) lives in search params.

---

## 3. Design system

LoopDox must look like a calm, precise tool for controlled documents, not a generic admin template. Use the following tokens in `app/globals.css` with Tailwind v4 `@theme`, light and dark.

**Typography**

- UI and body: **IBM Plex Sans** (400, 500, 600) via `next/font/google`.
- IDs, versions, code, hashes: **IBM Plex Mono** (400, 500).
- Scale (px): 12 / 13 / 14 (base) / 16 / 20 / 24 / 30. Headings `text-wrap: balance`. Uppercase labels: 11px, 600, letter-spacing 0.08em.
- `font-variant-numeric: tabular-nums` on all tables, counters and timers.

**Colour tokens** (light / dark)

| Token                    | Light                 | Dark                  | Use                           |
| ------------------------ | --------------------- | --------------------- | ----------------------------- |
| `--bg`                   | `#f3f4f9`             | `#0f1220`             | Page background               |
| `--surface`              | `#ffffff`             | `#161a2a`             | Cards, panels, sidebar        |
| `--surface-2`            | `#eceef6`             | `#1e2337`             | Hover, table headers, code    |
| `--line`                 | `#d9dcea`             | `#2a3048`             | Borders, dividers             |
| `--fg`                   | `#171b2e`             | `#e7e9f3`             | Primary text                  |
| `--muted`                | `#586079`             | `#9aa2bb`             | Secondary text                |
| `--accent`               | `#2f45c5`             | `#8fa0ff`             | Primary actions, links, focus |
| `--accent-soft`          | `#e3e7fb`             | `#242c59`             | Selected rows, active nav     |
| `--ok` / `--ok-soft`     | `#15734a` / `#dcf2e6` | `#5fd09a` / `#16322a` | Approved, passing, done       |
| `--warn` / `--warn-soft` | `#8a5700` / `#fbeed0` | `#f0bd58` / `#3a2d10` | In review, due soon           |
| `--bad` / `--bad-soft`   | `#b1232c` / `#fbe2e3` | `#ff8d93` / `#3d1c20` | Overdue, failed, breach       |
| `--premium`              | `#6d3fc0`             | `#b99cff`             | Premium badge only            |

Map shadcn's CSS variables (`--background`, `--primary`, etc.) onto these. Dark mode follows the OS by default with a user toggle (light / dark / system) stored in a cookie.

**Shape and density**

- Radius 6px on controls, 8px on cards. One subtle shadow, only on popovers and dialogs.
- Default row height 40px in tables; a "compact" density toggle sets 32px.
- 4px spacing grid. Content max width 1280px; reading column for policy text 72ch.

**Status is shown by form, not colour alone.** Every status pill has a dot or icon plus a label: Draft (hollow dot), In review (filled amber), Approved (filled green), Overdue (red with clock icon), Retired (strikethrough grey). Severity uses a left stripe on cards plus a label.

**Signature details**

- Every controlled record shows a mono **ID chip** (`ITD-006`, `DSR-2026-0012`, `INC-2026-0003`, `RISK-014`) and a **version chip** (`v4`).
- Policy pages show a **metadata strip**: Status · Version · Owner · Effective · Next review · Approved by.
- The **72-hour clock** is a prominent countdown component (section 9.3).

**Accessibility:** WCAG 2.2 AA. Visible focus rings (2px `--accent`). All interactive elements keyboard reachable. Respect `prefers-reduced-motion`. axe checks must pass on every page in Playwright.

**Responsive:** works from 360px wide. Sidebar collapses into a drawer below 1024px. Wide tables scroll inside their own container; the page body never scrolls horizontally.

---

## 4. Information architecture and routes

Path-based tenancy: every app route is under `/[org]` (the organisation slug). Use App Router route groups.

```
app/
  (marketing)/page.tsx                 → redirect to /login (marketing site is separate)
  (auth)/login/page.tsx
  (auth)/forgot-password/page.tsx
  (auth)/reset-password/page.tsx
  (auth)/accept-invite/[token]/page.tsx
  (app)/select-org/page.tsx            → for users in more than one org
  (app)/[org]/layout.tsx               → app shell: sidebar, top bar, org switcher, command palette
  (app)/[org]/page.tsx                 → Overview dashboard

  (app)/[org]/policies/page.tsx                       → tree + table
  (app)/[org]/policies/new/page.tsx                   → template picker → editor
  (app)/[org]/policies/[docId]/page.tsx               → read view (tabs: Page · History · Acknowledgements · Controls · Activity)
  (app)/[org]/policies/[docId]/edit/page.tsx
  (app)/[org]/policies/[docId]/versions/[version]/page.tsx
  (app)/[org]/my-policies/page.tsx                    → staff: what I must read and acknowledge

  (app)/[org]/privacy/processing/…                    → list, new, [id]
  (app)/[org]/privacy/pia/…                           → list, new (wizard), [id]
  (app)/[org]/privacy/requests/…                      → DSR list, new, [id]
  (app)/[org]/privacy/incidents/…                     → list, report, [id]
  (app)/[org]/privacy/agreements/…                    → list, new, [id]
  (app)/[org]/privacy/registration/page.tsx           → NPC registration
  (app)/[org]/privacy/training/page.tsx

  (app)/[org]/security/assets/…                       → systems list, new, [id]
  (app)/[org]/security/access/page.tsx                → access grants
  (app)/[org]/security/access-reviews/…               → list, [id] (run a review)
  (app)/[org]/security/secrets/…                      → rotation tracker
  (app)/[org]/security/changes/…                      → change log
  (app)/[org]/security/risks/…                        → register + heat map
  (app)/[org]/security/decisions/…                    → ADRs

  (app)/[org]/evidence/controls/…                     → controls list, [controlId]
  (app)/[org]/evidence/connectors/page.tsx
  (app)/[org]/evidence/uploads/page.tsx

  (app)/[org]/ask/page.tsx                            → full-page Ask
  (app)/[org]/ask/[threadId]/page.tsx
  (app)/[org]/questionnaires/…                        → list, upload, [id] review grid

  (app)/[org]/ai-governance/page.tsx                  → Premium overview
  (app)/[org]/ai-governance/inventory/…
  (app)/[org]/ai-governance/assessments/…
  (app)/[org]/ai-governance/profiles/page.tsx
  (app)/[org]/ai-governance/keys/page.tsx
  (app)/[org]/ai-governance/events/page.tsx

  (app)/[org]/settings/organisation/page.tsx
  (app)/[org]/settings/members/page.tsx
  (app)/[org]/settings/plan/page.tsx
  (app)/[org]/settings/notifications/page.tsx
  (app)/[org]/settings/audit-log/page.tsx

  api/auth/[...]/route.ts             → BFF auth (section 5)
  api/v1/[...path]/route.ts           → mock API or proxy to FastAPI (section 6)
```

**Sidebar groups:** Overview · Policies · Privacy · Security · Evidence · Ask · Questionnaires · AI Governance (Premium badge) · Settings. Items the user's tier doesn't include stay visible with a lock icon and open the upgrade page (section 5.3). Items the user's role can't access are hidden.

**Top bar:** org switcher, global search / command palette (`Ctrl/⌘ K`), "Ask" quick button, notifications bell, user menu (profile, theme, sign out).

**Command palette:** jump to any page, search records by ID or title, "Ask: …" sends the typed text to Ask, quick actions (Report an incident, New DSR, New policy).

---

## 5. Auth, roles, tiers

### 5.1 Auth (backend-for-frontend pattern)

- The FastAPI backend issues JWT access + refresh tokens. The browser **never** sees them in JavaScript: Next.js route handlers under `/api/auth/*` exchange credentials and set **httpOnly, Secure, SameSite=Lax cookies**.
- `/api/v1/*` route handlers attach the access token server-side and refresh it transparently.
- Route protection runs in Next.js request middleware (named `proxy.ts` in newer Next.js versions; use whichever the installed version expects) and redirects unauthenticated users to `/login?next=…`.
- Session idle timeout: 30 minutes of inactivity shows a "Still there?" dialog, then signs out.
- No tokens, PII or record contents in `localStorage`, analytics or console logs.
- In mock mode, the login page shows a "Sign in as…" list of the seeded users (section 6.2).

### 5.2 Roles and permissions

Roles per org membership: `owner`, `admin`, `dpo`, `cto`, `approver`, `staff`, `auditor` (external guest, read-only).

Create `lib/auth/permissions.ts` with a typed permission map and a `can(user, action, resource?)` helper, plus `<Can action="…">` and `useCan()`.

| Area                       | owner/admin | dpo  | cto  | approver | staff | auditor                               |
| -------------------------- | ----------- | ---- | ---- | -------- | ----- | ------------------------------------- |
| Policies: read approved    | ✓           | ✓    | ✓    | ✓        | ✓     | ✓                                     |
| Policies: read drafts      | ✓           | ✓    | ✓    | ✓        | –     | –                                     |
| Policies: edit / submit    | ✓           | ✓    | ✓    | –        | –     | –                                     |
| Policies: approve / reject | ✓           | –    | –    | ✓        | –     | –                                     |
| Privacy registers          | ✓           | edit | read | read     | –     | read (approved only)                  |
| Report an incident         | ✓           | ✓    | ✓    | ✓        | ✓     | –                                     |
| Sign off breach notice     | ✓           | –    | –    | ✓        | –     | –                                     |
| Security registers         | ✓           | read | edit | read     | –     | read                                  |
| Evidence                   | ✓           | edit | edit | read     | –     | read                                  |
| Ask                        | ✓           | ✓    | ✓    | ✓        | ✓     | ✓ (approved policies + evidence only) |
| Questionnaires             | ✓           | ✓    | ✓    | read     | –     | –                                     |
| AI Governance              | ✓           | ✓    | ✓    | read     | –     | read                                  |
| Settings: members, plan    | ✓           | –    | –    | –        | –     | –                                     |
| Reveal masked identifiers  | ✓           | ✓    | –    | –        | –     | –                                     |

The UI hides or disables what a role can't do, but **the server is the authority**: always handle `403` gracefully with a clear message.

### 5.3 Tiers and feature gating

`tenant.tier` is `starter | pro | premium`. Create `lib/entitlements.ts` with a feature map and `<Gate feature="…">`, which renders an **upgrade card** (what the feature does, which plan includes it, "Contact us to upgrade" button) instead of the content.

| Feature key                                               | Starter                     | Pro | Premium |
| --------------------------------------------------------- | --------------------------- | --- | ------- |
| `policies`, `privacy`                                     | ✓                           | ✓   | ✓       |
| `ask.policy`                                              | capped (show monthly meter) | ✓   | ✓       |
| `ask.records`, `ask.impact`                               | –                           | ✓   | ✓       |
| `security`, `evidence`, `questionnaires`, `auditorGuests` | –                           | ✓   | ✓       |
| `aiGovernance`                                            | –                           | –   | ✓       |

A tenant with `tier: "visorshield_only"` (VisorShield sold on its own) sees only Overview, AI Governance and Settings.

---

## 6. Data layer and mock API

### 6.1 One API path, two modes

- The frontend always calls **`/api/v1/...`** on its own origin through a typed client in `lib/api/client.ts`.
- `API_MODE=mock` (default in dev): `app/api/v1/[...path]/route.ts` dispatches to handlers in `mocks/handlers/*` backed by an in-memory store seeded from `mocks/seed/*`. In dev, persist the store to `.mock-db.json` (gitignored) so data survives restarts; `pnpm mock:reset` reseeds.
- `API_MODE=live`: the same route handler proxies to `API_BASE_URL` (FastAPI) with the access token attached.
- Mock handlers validate input with the **same zod schemas** the forms use, return the exact response shapes in section 7, simulate latency (150–400 ms), and support `?simulate=error` for testing error states.
- Every list endpoint supports `page`, `pageSize`, `sort`, `q` and per-field filters, and returns `{ items, page, pageSize, total }`.

### 6.2 Seed data (mock mode)

Seed two tenants so tier gating can be tested:

**Tenant A: "3rdLoop Solutions Corp."**, slug `3rdloop`, tier `premium`, timezone Asia/Manila.

- Users: Jehnsen Enrique (CTO, acting DPO, role `admin` + `dpo` + `cto`); Michael Manabat (Chairman/CEO, `approver`); Staff Member (`staff`); External Auditor (`auditor`). Names are editable seed values.
- Policies ITD-001 to ITD-016, grouped under five section pages (Governance & Risk, Privacy & Data Protection, Information Security, Operations & Resilience, AI Governance). Titles below are **placeholders except ITD-006**; keep them in one seed file so they're easy to replace:
  ITD-001 Document Control Policy · ITD-002 Code of Conduct & Corporate Governance · ITD-003 Risk Management Policy · ITD-004 Data Privacy & Protection Policy · ITD-005 Data Classification & Handling Policy · **ITD-006 Information Security Policy** · ITD-007 Access Control Policy · ITD-008 Acceptable Use Policy · ITD-009 Asset Management Policy · ITD-010 Secure Development Policy · ITD-011 Change Management Policy · ITD-012 Incident Response Policy · ITD-013 Business Continuity & Disaster Recovery Policy · ITD-014 Vendor & Third-Party Management Policy · ITD-015 AI Governance & Responsible Use Policy · ITD-016 Backup, Retention & Disposal Policy
- Give policies a realistic mix of statuses (approved with review dates, in review, draft, one overdue review) and 2–4 versions each with real diffs.
- 6 processing records, 2 PIAs, 4 DSRs (one due in 2 days), 2 incidents (one open breach with a running 72-hour clock started 30 hours before "now"), 5 agreements (one expiring within 30 days), 1 NPC registration, 10 systems, 25 access grants, 1 access review in progress, 8 secret records (two overdue for rotation), 15 changes, 12 risks, 4 ADRs, 30 controls (ISO/IEC 27001:2022 Annex A and DPA references) with evidence history, 3 connectors (one failing), 3 AI use cases, 90 days of proxy stats.

**Tenant B: "Sample Clinic"**, slug `sample-clinic`, tier `starter`, a few policies and privacy records only.

All seed data is clearly fictional except the 3rdLoop names above. Mark sample records with a `sample: true` flag and show a dismissible "Sample data" banner in mock mode.

---

## 7. API contract (frontend defines it; backend implements it)

Put all request/response types in `lib/api/types.ts` and document every endpoint in `docs/api-contract.md` (method, path, query, body, response, errors). The FastAPI team builds to this file. Base path `/api/v1`, JSON, ISO 8601 UTC timestamps, IDs as strings.

**Errors:** `{ error: { code: string, message: string, fields?: Record<string,string> } }` with HTTP 400 (validation, map `fields` onto form errors), 401, 403, 404, 409 (version conflict), 422, 429 (show retry-after), 500.

**Optimistic concurrency:** every editable record has `version: number`; updates send `ifVersion`; a `409` shows a "Someone changed this. Review their changes / Overwrite" dialog.

Core endpoints (extend as needed, keep REST naming consistent):

```
Auth/session   GET  /me                                → user, memberships, current tenant, tier, permissions, usage
Tenants        GET  /orgs/:org                          PATCH /orgs/:org
Members        GET/POST /orgs/:org/members              PATCH/DELETE /orgs/:org/members/:id   POST /orgs/:org/invites
Documents      GET/POST /orgs/:org/documents            GET/PATCH/DELETE /orgs/:org/documents/:id
               GET  /orgs/:org/documents/:id/versions   GET /orgs/:org/documents/:id/versions/:v
               POST /orgs/:org/documents/:id/submit | /approve | /reject | /restore {version} | /retire
               GET/POST /orgs/:org/documents/:id/acknowledgements
Privacy        CRUD /orgs/:org/processing-activities | /pias | /dsrs | /incidents | /agreements | /registrations | /training-records
               POST /orgs/:org/incidents/:id/notices/draft  → pre-filled NPC + data subject notices
               POST /orgs/:org/incidents/:id/notices/sign-off
Security       CRUD /orgs/:org/systems | /access-grants | /access-reviews | /secret-records | /changes | /risks | /decisions
               POST /orgs/:org/access-reviews/:id/items/:itemId {decision: keep|revoke|change, note}
               POST /orgs/:org/access-reviews/:id/sign-off
Evidence       GET  /orgs/:org/controls  GET /orgs/:org/controls/:id  GET /orgs/:org/controls/:id/evidence
               POST /orgs/:org/evidence (upload, multipart)  GET/PATCH /orgs/:org/connectors  POST /orgs/:org/connectors/:id/run
Ask            POST /orgs/:org/ask  (SSE stream, section 9.5)  GET /orgs/:org/ask/threads  GET /orgs/:org/ask/threads/:id
               POST /orgs/:org/ask/messages/:id/feedback {rating: up|down, note?}
Questionnaire  POST /orgs/:org/questionnaires (upload CSV/XLSX, multipart)  GET /orgs/:org/questionnaires/:id
               PATCH /orgs/:org/questionnaires/:id/rows/:rowId  POST /orgs/:org/questionnaires/:id/export → file
AI governance  CRUD /orgs/:org/ai/use-cases | /ai/assessments   GET/PATCH /orgs/:org/ai/profiles
               GET/POST/DELETE /orgs/:org/ai/keys   GET /orgs/:org/ai/stats?from&to   GET /orgs/:org/ai/events
Cross-cutting  GET /orgs/:org/search?q   GET /orgs/:org/audit-events?targetType&targetId   GET /orgs/:org/notifications
               POST /orgs/:org/sensitive/reveal {targetType, targetId, field} → value (audited)
               GET /orgs/:org/overview   GET /orgs/:org/graph/impact?nodeType&nodeId
```

**Entity types** (fields are a minimum; add `id`, `orgId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `version` to every entity):

- `Document`: docId (e.g. `ITD-006`), title, parentId, order, owner, requiresApproval, reviewCycleMonths (6|12|24), status (`draft|in_review|approved|retired`), currentVersion, approvedVersion, effectiveDate, nextReviewDate, approvedBy, approvedAt, classification, controlIds[]
- `DocumentVersion`: version, title, bodyMarkdown, changeSummary, type (`create|edit|restore`), author, createdAt
- `WorkflowEvent`: documentId, version, type (`submit|approve|reject|retire`), actor, note, at
- `Acknowledgement`: documentId, version, userId, at
- `ProcessingActivity`: name, purpose, legalBasis, dataSubjects[], dataCategories[] (flag sensitive personal information), sources, recipients[], crossBorder (bool + countries), retention, systemIds[], agreementIds[], piaId, owner, status
- `PIA`: processingActivityId, scope, risks[] {description, likelihood 1–5, impact 1–5, mitigation}, overallScore, decision (`proceed|proceed_with_conditions|do_not_proceed`), signedOffBy, signedOffAt
- `DSR`: ref (`DSR-YYYY-NNNN`), type (`access|correction|erasure|objection|portability|other`), requester (name + contact, masked), receivedAt, dueAt, identityVerified, assignee, status, outcome, processingActivityIds[]
- `Incident`: ref (`INC-YYYY-NNNN`), title, description, discoveredAt, reportedBy, severity (`low|medium|high|critical`), personalDataInvolved (bool), affectedCount, processingActivityIds[], systemIds[], notificationRequired (bool|null), notificationDeadline (= discoveredAt + 72h), npcNotifiedAt, subjectsNotifiedAt, status (`reported|triage|contained|notified|closed`), postIncidentReview
- `Agreement`: counterparty, type (`dpa|data_sharing|nda|msa`), role (`we_are_processor|we_are_controller`), signedAt, renewsAt, fileId, processingActivityIds[]
- `Registration`: registrar (`NPC`), reference, dpoName, registeredAt, renewsAt, status
- `TrainingRecord`: userId, course, completedAt, expiresAt
- `System`: name, type (`server|cloud_account|repository|domain|saas|database|other`), provider, owner, classification (`public|internal|confidential|restricted`), hosting, holdsPersonalData, notes
- `AccessGrant`: systemId, userId or externalName, level, approvedBy, grantedAt, lastReviewedAt
- `AccessReview`: period (e.g. `2026-Q4`), systemIds[], reviewer, items[] {grantId, decision, note}, status, signedOffAt
- `SecretRecord`: name, location (e.g. "Azure Key Vault: kv-prod"), systemId, owner, lastRotatedAt, rotationDays, nextDueAt — **never a secret value**
- `Change`: source (`github_pr|deploy|manual`), externalUrl, systemId, summary, approver, deployedAt, rollbackPlan, emergency (bool)
- `Risk`: ref (`RISK-NNN`), title, description, likelihood 1–5, impact 1–5, inherentScore, treatment (`mitigate|accept|transfer|avoid`), residualScore, owner, documentIds[], controlIds[], reviewAt, status
- `Decision` (ADR): ref (`ADR-NNN`), title, context, decision, consequences, status (`proposed|accepted|superseded`), decidedBy, decidedAt, systemIds[]
- `Control`: framework (`ISO27001:2022|DPA|NPC|internal`), reference (e.g. `A.5.15`), title, description, documentIds[], owner, evidenceFrequency, status (`passing|failing|no_evidence|not_applicable`)
- `Evidence`: controlId, source (`connector|upload|manual`), connectorId, collectedAt, result (`pass|fail|info`), summary, fileId
- `Connector`: provider (`github|azure|google_workspace|hostinger`), status (`connected|error|disconnected`), lastRunAt, lastError, checks[]
- `AskThread` / `AskMessage`: role, content, citations[] {kind: `policy_section|record|evidence`, label, href, docId?, version?, sectionId?}, route (`policy|records|impact`), feedback
- `Questionnaire`: name, client, uploadedAt, rows[] {question, draftAnswer, citations[], status (`draft|edited|approved|needs_input`), editor}
- `AIUseCase`: name, tool, provider, model, purpose, dataCategories[], systemIds[], processingActivityIds[], riskLevel (`low|medium|high`), owner, status
- `AIAssessment`: useCaseId, questions[] {q, answer}, riskLevel, humanOversight, decision, approvedBy
- `AIProfile`: name (`law_firm|clinic|govtech|custom`), piiRecognizers[] (incl. `PH_TIN`, `PH_SSS`, `PH_PHILSYS`), guardrails[], blockedTopics[], enabled
- `ProviderKey`: provider, label, storage (`fernet|azure_key_vault|byok`), last4, createdAt, rotatedAt — never the raw key after creation
- `AIStats`: date, calls, piiMasked, blocked, cacheHits, costEstimatePhp
- `AuditEvent`: actor, action, targetType, targetId, at, ip?, details

---

## 8. Shared UI building blocks (`components/`)

Build these once and reuse them everywhere:

- `AppShell`, `Sidebar` (collapsible, groups, lock icons), `TopBar`, `OrgSwitcher`, `CommandPalette`, `NotificationsBell`.
- `PageHeader` (breadcrumbs, title, ID chip, version chip, status pill, primary/secondary actions).
- `MetadataStrip` (label/value grid used on every record detail page).
- `DataTable` (TanStack Table: server pagination, sort, column filters, saved views in URL, column visibility, density toggle, row selection, empty/loading/error states, export button that calls the backend).
- `RecordForm` helpers: `FormField`, `PeoplePicker` (searches members), `RecordPicker` (search-and-link any entity, shows ID + title), `TagInput`, `DateField` (timezone-aware), `ScoreInput` (1–5 with labels), `ClassificationSelect`.
- `StatusPill`, `SeverityBadge`, `IdChip`, `VersionChip`, `PremiumBadge`, `SampleDataBanner`.
- `LinkedRecords` panel: shows the records this one links to and from, grouped by type, with "Link existing" and "Create linked" actions. This is how the cross-links in section 9.4 surface.
- `ActivityFeed`: audit events for a record (`/audit-events?targetType&targetId`).
- `SensitiveValue`: shows masked value (`•••• 4821`); "Reveal" (permission-gated) calls `/sensitive/reveal`, shows the value for 30 seconds, then masks again. Every reveal is audited server-side.
- `MarkdownView` (sanitised, GFM tables, heading anchors, `[[ITD-006]]` wiki links resolved to policy links, broken links styled and titled "No page with this ID yet").
- `MarkdownEditor` (CodeMirror, toolbar: H2, H3, bold, italic, lists, quote, code, link, `[[ ]]` page link, table; Write / Split / Preview; `Ctrl/⌘ S` saves; draft autosave to `sessionStorage` only, cleared on save).
- `DiffView` (line diff, unified and side-by-side, collapsed unchanged runs with "Show N lines").
- `CountdownClock` (section 9.3).
- `UpgradeCard`, `ConfirmDialog` (typed confirmation for destructive actions), `EmptyState` (explains what goes here and offers the first action), `ErrorState` (says what failed and how to retry).
- `FileDropzone` (drag and drop + browse, size/type validation, upload progress).

---

## 9. Module specifications

### 9.1 Overview dashboard (`/[org]`)

Summary before detail. Tiles only where the number is the point:

- **Controlled documents:** approved / total, stacked bar by status, link to policies.
- **Needs attention** (ranked list): open breaches with countdown, DSRs due within 7 days, policies awaiting approval (approvers see "Ready for your decision"), overdue reviews, secret rotations overdue, access reviews due, failing connectors, agreements renewing within 30 days.
- **Control coverage:** passing / failing / no evidence by framework (Pro+).
- **AI governance** (Premium): last 30 days calls, PII masked, blocked, sparkline.
- **Recent activity** table.
  Staff see a simplified overview: policies to acknowledge, "Report an incident", Ask box.

### 9.2 Policies

- **Library page:** left tree (sections → documents, status dots, drag to reorder for editors), right table (ID, title, status, owner, version, next review, last edited). Filters: status, owner, review due, framework. Toggle tree/table.
- **Read view:** metadata strip; workflow banner (In review → approver sees Approve / Request changes with note; others see "Waiting for approval"; Draft after an approved version → "v3 is the approved version on record"); overdue review banner; rendered body in a 72ch column with a sticky "On this page" TOC; linked controls; child pages table.
- **Tabs:** Page · History (version list with type, author, summary; select one to see diff vs previous or full text; "Restore as new version") · Acknowledgements (who has acknowledged the current approved version, progress bar, "Remind" button) · Controls · Activity.
- **Editor:** title, document ID, parent, owner, review cycle, requires approval, classification, body, change summary (required). Saving creates a new version. Saving an approved document returns it to Draft with a clear warning. Version conflict → 409 dialog.
- **New page:** template picker (Policy, Procedure/SOP, Blank) with section scaffolds.
- **Approval rules:** approving sets effectiveDate = today (tenant timezone) and nextReviewDate = today + reviewCycleMonths. Rejecting requires a note.
- **My policies** (staff): list of approved policies they haven't acknowledged for the current version; read view with "I have read and understood this policy" button at the end.

### 9.3 Privacy (DPO)

- **Processing records:** table + detail. Detail shows purpose, legal basis, data categories (sensitive ones highlighted), retention, recipients, cross-border, and `LinkedRecords` (systems, agreements, PIA, incidents, DSRs). Warning chips: "No PIA", "No agreement for recipient", "Retention not set".
- **PIA wizard:** steps: 1 Scope (pick processing activity) → 2 Data flows → 3 Risks (add rows with likelihood × impact, live 5×5 score) → 4 Mitigations → 5 Decision and sign-off. Progress saved per step. Read-only summary page after sign-off.
- **DSRs:** intake form (type, requester details masked after save, channel, received date). Due date = received + the configured response period (tenant setting, default 30 days; label it as a setting, not as legal advice). Detail: timeline (received → identity verified → in progress → responded → closed), assignee, linked processing activities, response notes, files. Table highlights due ≤ 7 days and overdue.
- **Incidents and breaches:**
  - "Report an incident" is available to every role from the top bar and Overview: short form (what happened, when discovered, what's affected, any personal data?).
  - Detail page leads with the **CountdownClock**: shows time remaining to `notificationDeadline` (discoveredAt + 72 hours) in days/hours/minutes, ticking every minute; neutral above 24h, `--warn` under 24h, `--bad` under 6h and after expiry ("Deadline passed 3h ago"). Stops and shows "Notified at …" once NPC notification is recorded. The clock only appears when personal data is involved; while `notificationRequired` is undecided it shows "Decide whether notification is required".
  - Triage panel: severity, affected count, linked processing activities and systems (pre-suggested from links), decision "Notification required?" with rationale.
  - Notices: "Draft notices" calls `/notices/draft` and opens two editable drafts (NPC notice, data subject notice) pre-filled from linked records; approver signs off; record "Sent to NPC at" and "Data subjects notified at".
  - Post-incident review section, with "Create risk" and "Create policy change" actions that link back.
- **Agreements:** table with renewal countdowns, file attached, linked processing records.
- **NPC registration:** one card with reference, DPO on record, registered/renews dates, renewal reminder, history.
- **Training:** matrix of people × courses with completion and expiry.

### 9.4 Security (CTO)

- **Systems:** table (type, provider, owner, classification, holds personal data). Detail with `LinkedRecords`: access grants, processing activities, changes, secrets, ADRs, AI use cases.
- **Access grants:** table grouped by system or by person; "Who has access to X" and "What can Y access" views.
- **Access reviews:** create for a period and a set of systems; the run page lists every grant with Keep / Revoke / Change + note, progress bar, bulk keep; sign-off produces an evidence item for the access control policy (shown as a confirmation linking to it).
- **Secrets:** rotation tracker with next due, overdue first; "Mark rotated" sets lastRotatedAt = now. A permanent notice: "LoopDox stores where a secret lives, never its value."
- **Changes:** log with source icon (GitHub PR / deploy / manual), link out, approver, emergency flag (emergency changes need a review note within 2 days; show overdue).
- **Risks:** register table + **5×5 heat map** (likelihood × impact) with counts per cell; click a cell to filter. Show inherent vs residual. Link to policies and controls.
- **Decisions (ADRs):** list + detail rendered as Context / Decision / Consequences; supersede flow.

### 9.5 Ask

- Full page: thread list on the left, conversation in the middle, **sources panel** on the right listing every citation of the selected answer.
- Composer with route hint chips ("Policies", "Records", "Impact") the user can pin; default is automatic routing. Records and Impact are Pro+ (locked chips for Starter).
- "As of" date picker for history mode (answers from the versions effective on that date).
- Streaming over **Server-Sent Events** from `POST /orgs/:org/ask`. Events: `route` {policy|records|impact}, `token` {text}, `citation` {…}, `done` {messageId, usage}, `error` {code, message}. Render tokens as they arrive; citations render as numbered superscripts `[1]` linking to the source (policy section anchors open the read view scrolled to that heading, records open their detail page).
- If an answer has no citation, render it as "I couldn't find this in your approved documents" with suggestions; never show an uncited answer as fact.
- Each answer: copy, thumbs up/down with optional note, "Open sources".
- Starter tier: usage meter in the composer ("38 of 100 questions this month"; numbers come from `/me` usage). At the cap, the composer shows the upgrade card.
- Quick Ask: the top-bar button and the command palette open a slide-over panel with the same chat, scoped to the current page (e.g. on ITD-007 it suggests "What does this policy require for MFA?").
- Show a small "Protected by VisorShield" note under the composer (all Ask calls run through the proxy, every tier).

### 9.6 Questionnaires (Pro+)

- Upload a client's security questionnaire (CSV or XLSX). The backend parses it; the frontend shows a column-mapping step (which column is the question, which is the answer).
- Review grid: question · draft answer (editable, markdown-lite) · citations · status (Draft / Edited / Approved / Needs input). Filters by status; keyboard navigation (↑/↓ rows, `Enter` edit, `⌘ Enter` approve).
- Progress bar; "Export" calls the backend and downloads the filled file in the original format.

### 9.7 AI Governance (Premium)

- **Overview:** proxy status (healthy / degraded), 30/90-day charts for calls, PII masked, blocked, cache hit rate and estimated cost in PHP; top blocked reasons; link to evidence these stats feed.
- **Inventory:** AI use cases table (tool, provider, model, purpose, data categories, risk level, owner); detail with linked systems and processing records; "Run assessment".
- **Assessments:** question set per use case, risk level, human oversight required, approval.
- **Policy profiles:** law firm, clinic, govtech, custom; toggle PII recognizers (including PH_TIN, PH_SSS, PH_PHILSYS), guardrails and blocked topics; "Test a prompt" box that shows what would be masked or blocked (calls a backend test endpoint; mock returns a plausible result).
- **Provider keys:** list (provider, label, storage type, last 4, rotated date). Add key: a one-time form; after submit the raw key is never shown again. BYOK option explains the one-time registration flow. Delete with typed confirmation.
- **Events:** audit event stream (time, app, user, action: masked / blocked / allowed, profile) with filters. **Show masked samples only; raw prompts never appear in LoopDox.**

### 9.8 Evidence (Pro+)

- **Controls:** table grouped by framework with status pills; filter failing / no evidence.
- **Control detail:** description, linked policies, owner, frequency, evidence timeline (newest first: date, source, result, summary, file), "Upload evidence", "Run connector now".
- **Connectors:** cards for GitHub, Azure, Google Workspace, Hostinger: status, last run, checks performed, last error with fix hint, Connect / Reconfigure / Run now. Connection flows are placeholders in mock mode (simulate success).
- **Auditor view:** auditors land on a read-only "Audit pack": controls → approved policy → evidence, with a period filter and "Export pack" (backend).

### 9.9 Settings

- **Organisation:** name, slug, logo, timezone (default Asia/Manila), DSR response period, review reminder lead time, data classification labels.
- **Members:** table, invite by email with role(s), change role, remove, pending invites, auditor guest expiry dates.
- **Plan:** current tier, usage (Ask questions, users, storage, connectors), feature comparison table, "Contact us to upgrade" (no payment UI yet).
- **Notifications:** per-user toggles for email and in-app per event type.
- **Audit log:** org-wide audit events table with filters and export (admins only).

---

## 10. Cross-cutting behaviour

- **Global search:** `/search?q` across documents, records and evidence; results grouped by type with ID chips and highlighted matches.
- **Notifications:** bell with unread count; items for approvals requested, deadlines (DSR, breach, review, rotation, renewal), mentions, connector failures.
- **Loading:** skeletons that match the final layout; never a blank page. Streaming route segments with `loading.tsx`.
- **Errors:** `error.tsx` per route group; `not-found.tsx`; 403 page explaining the missing permission.
- **Empty states:** say what goes here and offer the first action ("No processing records yet. Add the first one, or import from CSV.").
- **Dates:** relative for recent ("3 h ago") with absolute on hover; absolute dates as "14 Oct 2026".
- **Copy:** plain, specific, active voice. Buttons say what they do ("Submit for review", "Approve v4", "Record NPC notification"). Errors say what went wrong and how to fix it.
- **Security headers:** strict Content-Security-Policy (no inline scripts except Next's nonce), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal. Sanitise all rendered Markdown. Escape all user content.
- **Performance:** route-level code splitting; lazy-load CodeMirror, Recharts and the diff view; Lighthouse performance ≥ 90 on the Overview and policy read pages in production build.
- **i18n-ready:** keep UI strings in `lib/i18n/en.ts` (English only for now).

---

## 11. Project structure

```
app/                     routes (section 4)
components/ui/           shadcn primitives (restyled)
components/              shared building blocks (section 8)
features/<module>/       module components, hooks, columns, forms (policies, privacy, security, evidence, ask, questionnaires, ai-governance, settings, overview)
lib/api/                 client.ts, types.ts, hooks/ (TanStack Query hooks per resource), sse.ts
lib/auth/                session helpers, permissions.ts
lib/entitlements.ts
lib/schemas/             zod schemas shared by forms and mock handlers
lib/utils/               dates.ts (timezone), format.ts, ids.ts
lib/i18n/en.ts
mocks/handlers/          mock API handlers by resource
mocks/seed/              seed data (policies.ts holds the ITD titles)
mocks/store.ts           in-memory store + .mock-db.json persistence
docs/api-contract.md     endpoint reference for the backend team
docs/decisions.md        decisions made while building
tests/unit/              Vitest
tests/e2e/               Playwright
```

---

## 12. Environment variables

| Variable               | Example                        | Purpose                                             |
| ---------------------- | ------------------------------ | --------------------------------------------------- |
| `API_MODE`             | `mock`                         | `mock` or `live`                                    |
| `API_BASE_URL`         | `http://localhost:8000/api/v1` | FastAPI base URL in live mode                       |
| `SESSION_COOKIE_NAME`  | `loopdox_session`              | Auth cookie name                                    |
| `NEXT_PUBLIC_APP_NAME` | `LoopDox`                      | Product name (temporary name; keep it in one place) |

Provide `.env.example`. The product name must come from one constant so renaming later is a one-line change.

---

## 13. Milestones and acceptance criteria

Build in this order. After each milestone run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the milestone's Playwright specs; fix failures before moving on.

**M1 — Foundation**
Scaffold, tokens, fonts, light/dark, shadcn restyle, app shell (sidebar, top bar, org switcher, command palette shell), mock API framework + store + seed, BFF auth with seeded-user login, permissions and entitlements helpers, `Gate`, `Can`, error/empty/loading patterns.
_Done when:_ you can sign in as each seeded user, switch between `3rdloop` and `sample-clinic`, see role-appropriate nav, see locked items on Starter, and axe passes on the shell.

**M2 — Policies**
Library (tree + table), read view, editor, templates, versions, diff, restore, approval workflow, acknowledgements, My policies, `[[ID]]` links.
_Done when:_ an editor can create a policy, submit it, an approver approves it (effective and next review dates set), staff acknowledge it, a new edit returns it to Draft, history shows a correct diff, and restore creates a new version.

**M3 — Privacy**
Processing records, PIA wizard, DSRs, incidents with CountdownClock and notice drafting, agreements, NPC registration, training, `LinkedRecords`, `SensitiveValue`.
_Done when:_ reporting a breach with personal data starts the clock at discoveredAt + 72h, linked records pre-fill the notice drafts, the approver signs off, and recording NPC notification stops the clock. The countdown is unit-tested across the 24h/6h/expired thresholds and timezones.

**M4 — Overview dashboard and global search/notifications**
_Done when:_ every "Needs attention" item links to the right record and the counts match the seed data.

**M5 — Security**
Systems, access grants, access review run + sign-off, secrets tracker, changes, risk register + heat map, ADRs.
_Done when:_ completing an access review creates an evidence item that appears on the access control's evidence timeline.

**M6 — Evidence**
Controls, control detail timeline, uploads, connectors UI, auditor audit pack.
_Done when:_ an auditor can browse controls → approved policies → evidence and cannot see drafts or edit anything.

**M7 — Ask and Questionnaires**
SSE streaming client, threads, citations, sources panel, as-of mode, route chips, Starter cap meter, quick Ask slide-over; questionnaire upload, mapping, review grid, export.
_Done when:_ the mock streams a cited answer token by token, citations open the exact policy section, an uncited answer renders as "couldn't find", and Starter hits the cap and sees the upgrade card.

**M8 — AI Governance (Premium)**
Overview charts, inventory, assessments, profiles with test box, provider keys, events.
_Done when:_ Premium tenant sees all pages, Starter/Pro see the upgrade card, `visorshield_only` tenant sees only Overview + AI Governance + Settings, and no page ever shows a raw provider key after creation.

**M9 — Settings, hardening, polish**
Settings pages, audit log, security headers, performance budget, full Playwright suite (happy paths per module + permission denials + tier gating), axe on every route, responsive checks at 360 / 768 / 1280 px, README and `docs/api-contract.md` complete.
_Done when:_ all checks pass in CI and a production build runs with `API_MODE=mock`.

---

## 14. Out of scope for this build

- The FastAPI backend, the VisorShield proxy itself, the RAG pipeline, and real connector OAuth flows (the UI and contracts only).
- Payments and invoicing (Plan page shows "Contact us to upgrade").
- Public marketing site and public trust center.
- Mobile apps.
- Any sharing of records between organisations.

When finished with each milestone, reply with: what was built, how to try it (which seeded user, which URL), test results, and any decisions added to `docs/decisions.md`.
