# LoopDox — web frontend

LoopDox is one web app where a company's DPO and CTO run their compliance work: policies, privacy (Data Privacy Act of 2012), security registers, evidence, a cited Ask assistant, and AI governance (VisorShield).

This repo is the **frontend only** (Next.js App Router). The FastAPI backend is built separately against [`docs/api-contract.md`](docs/api-contract.md). Until it exists, the app runs against an in-repo **mock API** that implements the same contract.

- Product spec: [`docs/spec.md`](docs/spec.md)
- API contract: [`docs/api-contract.md`](docs/api-contract.md)
- Decisions log: [`docs/decisions.md`](docs/decisions.md)

## Status

| Milestone                                                                                                      | State   |
| -------------------------------------------------------------------------------------------------------------- | ------- |
| M1 Foundation: shell, auth, mock API, permissions, entitlements                                                | ✅ Done |
| M2 Policies: library, read view, editor, versions, diff, approval workflow, acknowledgements                   | ✅ Done |
| M3 Privacy                                                                                                     | Next    |
| M4 Overview · M5 Security · M6 Evidence · M7 Ask & Questionnaires · M8 AI Governance · M9 Settings & hardening | Planned |

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

| Variable               | Default                        | Purpose                                                                                      |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `API_MODE`             | `mock`                         | `mock`: `/api/v1/*` is served by the in-repo mock. `live`: proxied to FastAPI.               |
| `API_BASE_URL`         | `http://localhost:8000/api/v1` | FastAPI base URL (live mode only).                                                           |
| `SESSION_COOKIE_NAME`  | `loopdox_session`              | httpOnly access-token cookie. The refresh token uses the same name with `_refresh` appended. |
| `NEXT_PUBLIC_APP_NAME` | `LoopDox`                      | Product name. The UI reads it from one constant (`lib/config.ts`).                           |
| `MOCK_JWT_SECRET`      | dev value                      | Mock mode: signs mock JWTs.                                                                  |
| `MOCK_LATENCY_MS`      | `150-400`                      | Mock mode: simulated latency range, or `0`.                                                  |
| `MOCK_DB_FILE`         | `.mock-db.json`                | Mock mode: where dev data is persisted.                                                      |
| `MOCK_PERSIST`         | on                             | Set to `0` to keep mock data in memory only. Always in memory in production builds.          |
| `MOCK_ALLOW_RESET`     | off                            | Set to `1` to enable `POST /api/mock/reset` (Playwright does this).                          |

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
  api/mock/reset/         test-only reseed (MOCK_ALLOW_RESET=1)
components/ui/            shadcn-style primitives, restyled to our tokens
components/shell/         AppShell, Sidebar, TopBar, OrgSwitcher, CommandPalette, NotificationsBell, UserMenu, IdleTimeout
components/               shared blocks: PageHeader, MetadataStrip, StatusPill, chips, states, UpgradeCard, ConfirmDialog, Gate…
features/<module>/        module components, hooks and forms (policies/ in M2)
components/data-table/    DataTable (server paging/sort/filters in the URL), FacetFilter
components/markdown/      MarkdownView (sanitised, [[ID]] links), MarkdownEditor (CodeMirror, lazy)
lib/api/                  client.ts, types.ts (the contract), query-keys.ts, hooks/
lib/auth/                 permissions.ts, can.tsx, cookies.ts, refresh.ts
lib/server/               server-only helpers: backend caller, session, origin check
lib/schemas/              zod schemas shared by forms and the mock API
lib/utils/                dates (timezone-aware), format, ids, list params, hooks
lib/markdown/             wiki-link remark plugin, TOC extraction, sanitize schema
lib/diff.ts               line/word diff used by DiffView
lib/i18n/en.ts            UI strings
lib/entitlements.ts       plan features
lib/nav.ts                sidebar and command-palette navigation
mocks/                    mock API: dispatch, router, handlers/, seed/, store.ts
proxy.ts                  auth redirect, token refresh, CSP nonce
docs/                     spec, API contract, decisions
tests/unit/               Vitest
tests/e2e/                Playwright (+ axe)
```

## Design system

Tokens (colours, type scale, radii) are defined in `app/globals.css` with Tailwind v4 `@theme`, in light and dark. Use the token utilities (`bg-surface`, `text-muted`, `border-line`, `bg-accent`, `text-ok`, `bg-warn-soft`…), not raw colours. Fonts: IBM Plex Sans and IBM Plex Mono. Theme preference (light / dark / system) is stored in a cookie.
