# LoopDox API contract

The frontend defines this contract and the FastAPI backend implements it. TypeScript types for every request and response are in [`lib/api/types.ts`](../lib/api/types.ts), which is the source of truth. The in-repo mock API (`mocks/`) implements the same contract and is the reference behaviour.

> **Status:** covers the endpoints the frontend uses up to **M1 (Foundation)**. Each milestone adds its endpoints here.

---

## Conventions

|            |                                                                                                                                                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base path  | `/api/v1`                                                                                                                                           |
| Format     | JSON (`application/json`), except file uploads (`multipart/form-data`) and Ask (`text/event-stream`)                                                |
| Timestamps | ISO 8601 UTC, e.g. `2026-10-14T02:30:00.000Z`. Calendar dates (effective dates, review dates) are `YYYY-MM-DD` in the tenant's timezone.            |
| IDs        | Strings. Display references (`ITD-006`, `DSR-2026-0012`) are separate fields.                                                                       |
| Tenancy    | Path-based: `/orgs/:org/...`, where `:org` is the organisation **slug**.                                                                            |
| Auth       | `Authorization: Bearer <access JWT>`. The browser never holds tokens: the Next.js BFF keeps them in httpOnly cookies and attaches them server-side. |

### Every entity

Every entity has `id`, `orgId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `version`. The mock also sets `sample: true` on seed records.

### Lists

Every list endpoint accepts:

| Param           | Meaning                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `page`          | 1-based, default `1`                                                   |
| `pageSize`      | default `25`, max `200`                                                |
| `sort`          | field name; prefix with `-` for descending (`-updatedAt`)              |
| `q`             | free-text search across the endpoint's searchable fields               |
| _field filters_ | per-endpoint, e.g. `status=draft,in_review` (comma-separated = any of) |

Response:

```json
{ "items": [], "page": 1, "pageSize": 25, "total": 0 }
```

### Errors

```json
{
  "error": {
    "code": "validation_error",
    "message": "Some fields need attention.",
    "fields": { "email": "Enter a valid email address." }
  }
}
```

| Status | `code`                                   | When                                                                                                                                              |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `validation_error`                       | Body or query failed validation. `fields` maps field paths (dot-separated, e.g. `risks.0.likelihood`) to messages; the UI shows them on the form. |
| 401    | `unauthenticated`, `invalid_credentials` | Missing or expired token; wrong login.                                                                                                            |
| 403    | `forbidden`                              | The caller's role doesn't allow the action.                                                                                                       |
| 403    | `feature_not_in_plan`                    | The org's tier doesn't include the feature.                                                                                                       |
| 404    | `not_found`                              | Record doesn't exist **or** the caller isn't a member of the org (the API doesn't reveal which).                                                  |
| 405    | `method_not_allowed`                     | Known path, wrong method. `Allow` header lists valid methods.                                                                                     |
| 409    | `version_conflict`                       | `ifVersion` doesn't match the stored `version`.                                                                                                   |
| 422    | `unprocessable`, `invalid_token`         | Well-formed but can't be applied (e.g. expired reset token).                                                                                      |
| 429    | `rate_limited`                           | `Retry-After` header in seconds.                                                                                                                  |
| 500    | `internal_error`                         | Unexpected.                                                                                                                                       |

### Optimistic concurrency

Every editable record has `version: number`. `PATCH` bodies include `ifVersion`. If it doesn't match, respond **409** `version_conflict` and leave the record unchanged. Successful writes increment `version`.

### Testing hooks (mock only)

- `?simulate=error` on any endpoint returns a 500 `internal_error`.
- `MOCK_LATENCY_MS` sets simulated latency (default 150–400 ms).

---

## Roles and permissions

Roles per membership: `owner`, `admin`, `dpo`, `cto`, `approver`, `staff`, `auditor`. A member can hold several roles; permissions are the union. The role → permission map is in [`lib/auth/permissions.ts`](../lib/auth/permissions.ts); the backend must enforce the same map. `GET /me` returns the resolved `permissions` array.

Status-scoped rules the backend must enforce:

- Only callers with `policies.read_drafts` see policies whose status isn't `approved`.
- Auditor-only members see only `approved` privacy records.

## Tiers

`starter | pro | premium | visorshield_only`. The feature map is in [`lib/entitlements.ts`](../lib/entitlements.ts). Endpoints for a feature the tier doesn't include return **403 `feature_not_in_plan`**.

---

## Auth

Public endpoints (no bearer token) except logout.

### `POST /auth/login`

Body `LoginRequest`: `{ "email": "…", "password": "…" }`

200 `TokenPair`:

```json
{ "accessToken": "…", "refreshToken": "…", "expiresIn": 900, "refreshExpiresIn": 43200 }
```

Errors: 400 `validation_error`, 401 `invalid_credentials`, 429.

### `POST /auth/refresh`

Body `{ "refreshToken": "…" }` → 200 `TokenPair` (rotate the refresh token), or 401 `unauthenticated`.

### `POST /auth/logout` (bearer)

Revokes the session's refresh token. 204.

### `POST /auth/forgot-password`

Body `{ "email": "…" }` → **202** whether or not the account exists. Sends a reset link to `/reset-password?token=…` (valid 1 hour).

### `POST /auth/reset-password`

Body `{ "token": "…", "password": "…", "confirm": "…" }` → 204. Password: 12–200 characters; `confirm` must match.
Errors: 400 `validation_error`, 422 `invalid_token`.

### `GET /auth/invites/:token`

200 `InvitePreview`:

```json
{
  "token": "…",
  "orgName": "3rdLoop Solutions Corp.",
  "email": "new.hire@…",
  "roles": ["staff"],
  "invitedBy": "Jehnsen Enrique",
  "expiresAt": "…"
}
```

404 if expired, used or unknown.

### `POST /auth/invites/:token/accept`

Body `{ "name": "…", "password": "…", "confirm": "…" }` → 200 `TokenPair` (signs the new member in). Creates the user if the email is new, and activates the membership.

---

## Session

### `GET /me?org=:slug` (bearer)

200 `MeResponse`:

| Field         | Type                  | Notes                                                                                                    |
| ------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `user`        | `User`                | `{ id, name, email, title }`                                                                             |
| `memberships` | `MembershipSummary[]` | Active, unexpired memberships: `{ org: { id, slug, name, tier }, roles }`                                |
| `org`         | `Org \| null`         | The org named by `?org=`, or the only membership. `null` if neither applies, or the user isn't a member. |
| `roles`       | `Role[]`              | Roles in `org`                                                                                           |
| `tier`        | `Tier \| null`        |                                                                                                          |
| `permissions` | `Permission[]`        | Resolved from `roles`                                                                                    |
| `usage`       | `Usage \| null`       | `askQuestions {used, limit, periodStart}`, `users`, `storageMb`, `connectors`; `limit: null` = unlimited |
| `apiMode`     | `"mock" \| "live"`    | FastAPI always returns `"live"`                                                                          |

---

## Tenants and members

### `GET /orgs/:org` → 200 `Org`

`{ id, slug, name, tier, timezone, currency, logoUrl, settings: { dsrResponseDays, reviewReminderLeadDays, classificationLabels }, version, createdAt, updatedAt }`

### `GET /orgs/:org/members` → 200 `ListResponse<Member>`

Any member may list (needed for people pickers). `q` searches name, email, title. Filters: `role`, `status` (`active|invited`). Default sort `name`.

`Member`: `{ id, orgId, userId, name, email, title, roles, status, expiresAt, invitedAt, joinedAt, version }`

_(PATCH/DELETE members and POST invites arrive with Settings in M9.)_

---

## Notifications

### `GET /orgs/:org/notifications` → 200 `NotificationList`

The caller's own notifications in this org. `ListResponse<Notification>` plus `unread: number`. Default sort `-at`. Filter `unread=true`.

`Notification`: `{ id, orgId, userId, type, title, body, href, at, readAt }`, where `type` is one of `approval_requested | approval_decided | deadline_dsr | deadline_breach | deadline_review | deadline_rotation | deadline_renewal | mention | connector_failed`. `href` is an app path (`/3rdloop/privacy/requests/…`).

### `POST /orgs/:org/notifications/read`

Body `{ "ids": ["…"] }` or `{ "all": true }` → 204.

---

## Search

### `GET /orgs/:org/search?q=` → 200 `SearchResponse`

Searches documents, records and evidence the caller can see. Queries shorter than 2 characters return no groups.

```json
{
  "q": "itd-006",
  "groups": [
    {
      "type": "document",
      "label": "Policies",
      "items": [
        {
          "type": "document",
          "id": "doc_itd_006",
          "ref": "ITD-006",
          "title": "Information Security Policy",
          "href": "/3rdloop/policies/doc_itd_006",
          "snippet": "…applies to «ITD-006»…"
        }
      ]
    }
  ]
}
```

Matches in `snippet` are wrapped in `«` `»`; the client turns them into highlights. Don't return HTML. At most 8 items per group.

---

## Audit events

### `GET /orgs/:org/audit-events?targetType=&targetId=` → 200 `ListResponse<AuditEvent>`

- With `targetType` and `targetId`: the activity for one record, visible to anyone who can see that record.
- Without them: the org-wide log, which requires `audit_log.read` (403 otherwise).

`q` searches action, target label, actor. Filters: `action` (prefix match), `actorId`. Default sort `-at`.

`AuditEvent`: `{ id, orgId, actor: { id, name } | null, action, targetType, targetId, targetLabel, at, ip?, details }`
