# LoopDox — web frontend

LoopDox is one web app where a company's DPO and CTO run their compliance work: policies, privacy (Data Privacy Act of 2012), security registers, evidence, a cited Ask assistant, and AI governance (VisorShield).

This repo is the **frontend only** (Next.js App Router). The FastAPI backend is built separately against [`docs/api-contract.md`](docs/api-contract.md). Until it exists, the app runs against an in-repo **mock API** that implements the same contract.

- Product spec: [`docs/spec.md`](docs/spec.md)
- API contract: [`docs/api-contract.md`](docs/api-contract.md)
- Decisions log: [`docs/decisions.md`](docs/decisions.md)

## Status

| Milestone                                                                                                                                          | State   |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| M1 Foundation: shell, auth, mock API, permissions, entitlements                                                                                    | ✅ Done |
| M2 Policies: library, read view, editor, versions, diff, approval workflow, acknowledgements                                                       | ✅ Done |
| M3 Privacy: processing records, PIA wizard, DSRs, incidents with the 72-hour clock and notices, agreements, NPC registration, training             | ✅ Done |
| M4 Overview dashboard, global search and notifications                                                                                             | ✅ Done |
| M5 Security: systems, access reviews, secrets, changes, risks, decisions                                                                           | ✅ Done |
| M6 Evidence: controls, uploads, connectors, auditor audit pack                                                                                     | ✅ Done |
| M7 Ask & Questionnaires: streamed cited answers, threads, sources panel, as-of mode, Quick Ask; questionnaire upload, mapping, review grid, export | ✅ Done |
| M8 AI Governance                                                                                                                                   | Next    |
| M9 Settings & hardening                                                                                                                            | Planned |

Modules not built yet already appear in the navigation. They open a placeholder that applies the real permission check and plan gate.

## Requirements

- Node.js ≥ 20.9 (developed on 24)
- pnpm 9

## Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. In mock mode, the sign-in page lists every seeded user under **Sign in as…**.

## Scripts

| Script                              | What it does                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Dev server (Turbopack) on port 3000                                                                                                                    |
| `pnpm build` / `pnpm start`         | Production build / serve                                                                                                                               |
| `pnpm lint`                         | ESLint (Next.js + typescript-eslint strict)                                                                                                            |
| `pnpm typecheck`                    | `next typegen` then `tsc --noEmit`                                                                                                                     |
| `pnpm format` / `pnpm format:check` | Prettier (with Tailwind class sorting)                                                                                                                 |
| `pnpm test`                         | Unit and component tests (Vitest + Testing Library)                                                                                                    |
| `pnpm test:e2e`                     | End-to-end and accessibility tests (Playwright + axe). Starts its own dev server on port 3100. Run `pnpm exec playwright install chromium` once first. |
| `pnpm mock:reset`                   | Reseed the mock database (`.mock-db.json`). Restart `pnpm dev` afterwards.                                                                             |

> Next.js allows one `next dev` per project directory. If you have `pnpm dev` running, run the suite against a production build instead: `pnpm build && E2E_PROD=1 pnpm test:e2e`.

## Environment variables

| Variable               | Default                        | Purpose                                                                                                      |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `API_MODE`             | `mock`                         | `mock`: `/api/v1/*` is served by the in-repo mock. `live`: proxied to FastAPI.                               |
| `API_BASE_URL`         | `http://localhost:8000/api/v1` | FastAPI base URL (live mode only).                                                                           |
| `SESSION_COOKIE_NAME`  | `loopdox_session`              | httpOnly access-token cookie. The refresh token uses the same name with `_refresh` appended.                 |
| `NEXT_PUBLIC_APP_NAME` | `LoopDox`                      | Product name. The UI reads it from one constant (`lib/config.ts`).                                           |
| `MOCK_JWT_SECRET`      | dev value                      | Mock mode: signs mock JWTs.                                                                                  |
| `MOCK_LATENCY_MS`      | `150-400`                      | Mock mode: simulated latency range, or `0`.                                                                  |
| `MOCK_DB_FILE`         | `.mock-db.json`                | Mock mode: where dev data is persisted.                                                                      |
| `MOCK_PERSIST`         | on                             | Set to `0` to keep mock data in memory only. Always in memory in production builds.                          |
| `MOCK_ALLOW_RESET`     | off                            | Set to `1` to enable the test-only `POST /api/mock/reset` and `POST /api/mock/usage` (Playwright does this). |
| `MOCK_STREAM_DELAY_MS` | `30`                           | Mock mode: delay between streamed Ask tokens, or `0`.                                                        |

## Mock mode

- `app/api/v1/[...path]/route.ts` is the backend-for-frontend (BFF). It reads the access token from the httpOnly cookie, refreshes it when needed, and forwards the request to the mock dispatcher (`mocks/dispatch.ts`) in mock mode or to FastAPI in live mode. Browser code always calls `/api/v1/...` on its own origin, through `lib/api/client.ts`.
- Handlers in `mocks/handlers/*` validate input with the same zod schemas the forms use (`lib/schemas`), and return the contract's exact shapes and error envelope.
- `?simulate=error` on any API call returns a 500, for testing error states.
- Data is seeded relative to "now" on first run and persisted to `.mock-db.json` (gitignored), so it survives restarts. `pnpm mock:reset` starts over.
- Sample records carry `sample: true`, and a dismissible banner shows in mock mode.

### Seeded users

Every seeded user's password is `loopdox-demo`. Or use the one-click **Sign in as…** list.

| User              | Email                               | Organisation(s) and roles                       |
| ----------------- | ----------------------------------- | ----------------------------------------------- |
| Jehnsen Enrique   | `jehnsen.enrique@3rdloop.example`   | 3rdLoop: admin, DPO, CTO · Sample Clinic: admin |
| Michael Manabat   | `michael.manabat@3rdloop.example`   | 3rdLoop: approver                               |
| Staff Member      | `staff@3rdloop.example`             | 3rdLoop: staff                                  |
| External Auditor  | `auditor@audit-firm.example`        | 3rdLoop: auditor (guest, expires in 60 days)    |
| Dra. Liza Santos  | `liza.santos@sample-clinic.example` | Sample Clinic: owner, DPO, approver             |
| Clinic Front Desk | `frontdesk@sample-clinic.example`   | Sample Clinic: staff                            |

| Organisation            | Slug            | Tier    |
| ----------------------- | --------------- | ------- |
| 3rdLoop Solutions Corp. | `3rdloop`       | Premium |
| Sample Clinic           | `sample-clinic` | Starter |

Other demo links: `/accept-invite/demo-invite-token` (pending invite) and `/reset-password?token=demo-reset-token`.

Policy titles are in `mocks/seed/policies.ts` (placeholders except ITD-006). Policy text, with its version history, is in `mocks/seed/policy-content.ts`; each clause records the version that introduced it, so the seeded history has real diffs.

### Policies to try

| Where                                  | What you'll see                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `/3rdloop/policies`                    | Tree and table, filters (status, owner, review, section, framework), CSV export |
| `ITD-006`                              | Approved v4 with four versions of history; open History for diffs               |
| `ITD-007`                              | v3 in review. As Michael Manabat: Approve / Request changes                     |
| `ITD-010`                              | Never-approved draft with a "changes requested" note                            |
| `ITD-013`                              | Review overdue                                                                  |
| `ITD-015`                              | Draft v3 on top of approved v2 (staff still see v2)                             |
| `/3rdloop/my-policies` as Staff Member | ITD-008 and ITD-012 waiting to be acknowledged                                  |

### Privacy to try

Signed in as Jehnsen Enrique (admin and DPO) unless noted. Privacy data lives in `mocks/seed/privacy.ts`; the 10 systems that records link to are in `mocks/seed/systems.ts`.

| Where                                                        | What you'll see                                                                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `/3rdloop/privacy/incidents/inc_2026_0003`                   | Open breach whose 72-hour clock started 30 hours before seeding. Triage it, link records (try the suggestions), then **Draft notices** |
| Same incident, as Michael Manabat                            | **Sign off notices**; then back as Jehnsen, **Record NPC notification** stops the clock                                                |
| `/3rdloop/privacy/incidents/inc_2026_0002`                   | Closed breach, notified on time, with signed-off notices and a post-incident review                                                    |
| Top bar → **Report an incident** as Staff Member             | Staff can report (and get a receipt) but can't open the register                                                                       |
| `/3rdloop/privacy/processing`                                | Register with warning chips (No PIA, No agreement for recipient, Retention not set), sensitive data flags, CSV export                  |
| `/3rdloop/privacy/processing/pa_002`                         | Linked records in both directions: systems, agreement, PIA, DSR, incident                                                              |
| `/3rdloop/privacy/pia/pia_002`                               | PIA wizard paused at step 3 (risks), with the live 5×5 matrix                                                                          |
| `/3rdloop/privacy/requests/dsr_2026_0012`                    | DSR due in 2 days. **Reveal** the masked requester (shown for 30 s, audited); Michael Manabat can't                                    |
| `/3rdloop/privacy/agreements`                                | AGR-001 renews within 30 days                                                                                                          |
| `/3rdloop/privacy/registration`, `/3rdloop/privacy/training` | NPC registration card; training matrix with expired, expiring and missing courses                                                      |
| `/sample-clinic/privacy/registration` as Dra. Liza Santos    | Registration renewal due; on Starter there's no Systems group in linked records                                                        |
| As External Auditor                                          | Only finalised privacy records: approved processing records, signed-off PIAs, closed DSRs and incidents                                |

### Ask and questionnaires to try

Ask only answers from approved policy text and the records you can see, and every line links to its source. The mock engine is in `mocks/ask/`; it quotes passages rather than writing new text.

| Where                                             | What you'll see                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/3rdloop/ask` as Jehnsen Enrique                 | Ask "What does the Access Control Policy require for MFA?": the answer streams in, cites ITD-007 **v2** (v3 is still in review) and the sources panel lists it. Click the **1** to land on the highlighted section. |
| Same page                                         | "Which systems hold personal data?" answers from the registers; pin **Impact** and ask "What is affected if we change ITD-007?"                                                                                     |
| Same page, **As of…**                             | Pick a date before ITD-007 v2 was approved: the answer quotes v1                                                                                                                                                    |
| Same page                                         | Ask something no policy covers ("guest Wi-Fi password"): "I couldn't find this in your approved documents", with suggestions                                                                                        |
| `/3rdloop/policies/doc_itd_007` → top bar **Ask** | Quick Ask suggests "What does this policy require for MFA?"                                                                                                                                                         |
| ⌘K → type a question → **Ask: …**                 | Opens Quick Ask with the answer                                                                                                                                                                                     |
| `/sample-clinic/ask` as Clinic Front Desk         | Starter meter ("38 of 100 questions this month"); Records and Impact locked. At 100 the composer becomes the upgrade card                                                                                           |
| `/3rdloop/questionnaires/qnr_seed_1`              | A client's Excel assessment with 4 of 12 answers approved and 2 needing input. ↑/↓, **Enter** to edit, **⌘ Enter** to approve; **Export XLSX**                                                                      |
| `/3rdloop/questionnaires/upload`                  | Upload your own CSV or XLSX, check the suggested columns, **Draft answers**                                                                                                                                         |
| `/sample-clinic/questionnaires`                   | Upgrade card (Pro and above)                                                                                                                                                                                        |

## Auth (backend-for-frontend)

- `/api/auth/login`, `/logout`, `/forgot-password`, `/reset-password` and `/invites/:token[/accept]` exchange credentials with the backend and set **httpOnly, SameSite=Lax** cookies (Secure in production). Tokens never reach browser JavaScript.
- `proxy.ts` runs before every page. It redirects signed-out users to `/login?next=…`, refreshes expired access tokens, and sets a per-request nonce Content-Security-Policy.
- Mutating `/api/*` requests must be same-origin.
- After 30 minutes of inactivity in every tab, a "Still there?" dialog appears; the user is signed out 60 seconds later.

## Permissions and plans

- `lib/auth/permissions.ts`: the role → permission map, plus `can(subject, action, resource?)`. In components, use `useCan()` and `<Can action="…">` from `lib/auth/can.tsx`.
- `lib/entitlements.ts`: the tier → feature map. `<Gate feature="…">` (`components/gate.tsx`) renders an upgrade card when the plan lacks the feature.
- Navigation (`lib/nav.ts`) hides items the role can't use, and shows tier-locked items with a lock.
- The server is the authority: the UI handles 403 with a clear message.

## Folder map

```
app/                      routes (App Router)
  (marketing)/            "/" → /login
  (auth)/                 login, forgot/reset password, accept invite
  (app)/select-org/       choose an organisation
  (app)/[org]/            app shell and every module, path-based tenancy
  api/auth/[...action]/   BFF auth endpoints
  api/v1/[...path]/       BFF proxy → mock or FastAPI
  api/mock/reset/, usage/ test-only reseed and Ask usage setter (MOCK_ALLOW_RESET=1)
components/ui/            shadcn-style primitives, restyled to our tokens
components/shell/         AppShell, Sidebar, TopBar, OrgSwitcher, CommandPalette, NotificationsBell, UserMenu, IdleTimeout
components/               shared blocks: PageHeader, MetadataStrip, StatusPill, chips, states, UpgradeCard, ConfirmDialog, Gate…
features/<module>/        module components, hooks and forms (policies/ M2, privacy/ M3, security/ M5, evidence/ M6, ask/ and questionnaires/ M7)
components/data-table/    DataTable (server paging/sort/filters in the URL), FacetFilter
components/markdown/      MarkdownView (sanitised, [[ID]] links), MarkdownEditor (CodeMirror, lazy)
components/form/          FormField, PeoplePicker, RecordPicker, TagInput, DateField (timezone-aware), ScoreInput
components/               … CountdownClock, SensitiveValue, LinkedRecords, FileDropzone, RiskMatrix (M3)
lib/api/                  client.ts, types.ts (the contract), query-keys.ts, hooks/
lib/auth/                 permissions.ts, can.tsx, cookies.ts, refresh.ts
lib/server/               server-only helpers: backend caller, session, origin check
lib/schemas/              zod schemas shared by forms and the mock API
lib/utils/                dates (timezone-aware), format, ids, list params, hooks
lib/markdown/             wiki-link remark plugin, TOC extraction, sanitize schema
lib/diff.ts               line/word diff used by DiffView
lib/api/sse.ts            Server-Sent Events reader for Ask streams
lib/markdown/             … plus sections.ts (policy passages with heading anchors) and citations.ts ([n] superscripts)
lib/countdown.ts          72-hour breach clock rules (thresholds, text), unit-tested
lib/links.ts              which records link to which, and which side stores the link
lib/privacy.ts, risk.ts   privacy labels and due-date rules; 5×5 risk scoring
lib/files.ts              upload size/type rules
lib/i18n/en.ts            UI strings
lib/entitlements.ts       plan features
lib/nav.ts                sidebar and command-palette navigation
mocks/                    mock API: dispatch, router, handlers/, seed/, store.ts, records.ts (link registry), notices.ts (notice drafts)
mocks/ask/                Ask engine: policy retrieval (policies.ts), routing, records and impact (engine.ts)
mocks/tabular.ts          CSV and XLSX read/write for questionnaires (mock only)
proxy.ts                  auth redirect, token refresh, CSP nonce
docs/                     spec, API contract, decisions
tests/unit/               Vitest
tests/e2e/                Playwright (+ axe)
```

## Design system

Tokens (colours, type scale, radii) are defined in `app/globals.css` with Tailwind v4 `@theme`, in light and dark. Use the token utilities (`bg-surface`, `text-muted`, `border-line`, `bg-accent`, `text-ok`, `bg-warn-soft`…), not raw colours. Fonts: IBM Plex Sans and IBM Plex Mono. Theme preference (light / dark / system) is stored in a cookie.
