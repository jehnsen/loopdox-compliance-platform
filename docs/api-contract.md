# LoopDox API contract

The frontend defines this contract and the FastAPI backend implements it. TypeScript types for every request and response are in [`lib/api/types.ts`](../lib/api/types.ts), which is the source of truth. The in-repo mock API (`mocks/`) implements the same contract and is the reference behaviour.

> **Status:** covers the endpoints the frontend uses up to **M2 (Policies)**. Each milestone adds its endpoints here.

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

---

## Documents (policies) — M2

Feature `policies`. Every route below returns 403 `feature_not_in_plan` for tiers without it.

### Visibility rule (backend must enforce)

- Callers **with** `policies.read_drafts` see every document as stored.
- Callers **without** it (staff, auditors) see only documents with `approvedVersion !== null` and `status !== "retired"`, **projected**: `status` = `"approved"`, `currentVersion` = `approvedVersion`, `content` = the approved version, `workflow` = `[]`. Anything else returns **404**. Version endpoints return 404 for versions above the approved one.

### Types

`Document`, `DocumentSummary`, `DocumentDetail`, `DocumentVersion`, `DocumentVersionSummary`, `WorkflowEvent`, `DocumentLookupItem`, `Acknowledgement` and `AcknowledgementStatus` are in `lib/api/types.ts`. In short:

- `Document.version` is the **concurrency counter**; `currentVersion` / `approvedVersion` are **content version numbers**.
- `DocumentSummary` adds `ownerName`, `approvedByName`, `updatedByName`, `childCount` and `reviewState` (`ok | due_soon | overdue | null`). `due_soon` means within the org's `reviewReminderLeadDays` of `nextReviewDate`; `null` means not approved or retired.
- `DocumentDetail` adds `content` (the version this caller reads), `children` (visible children, ordered), `workflow` (newest first; empty for read-only callers), `acknowledgedByMe` and `acknowledgedAt`.
- Dates: `effectiveDate` and `nextReviewDate` are `YYYY-MM-DD` in the tenant's timezone.

### `GET /orgs/:org/documents` → `ListResponse<DocumentSummary>`

Permission `policies.read`. `q` searches docId, title and owner name. Default sort `docId`. Sortable: any field, e.g. `title`, `status`, `ownerName`, `currentVersion`, `nextReviewDate`, `updatedAt`, `order`.

| Filter      | Values                                                                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `status`    | `draft,in_review,approved,retired`                                                                                                               |
| `owner`     | user IDs                                                                                                                                         |
| `review`    | `overdue,due_soon,ok`                                                                                                                            |
| `parent`    | parent document IDs, or `root`                                                                                                                   |
| `framework` | `ISO27001:2022,DPA,NPC,internal`: documents linked to a control in that framework                                                                |
| `ack`       | `pending` or `done`, for the **caller**: approved documents requiring approval that the caller has / hasn't acknowledged at the approved version |

### `GET /orgs/:org/documents/lookup` → `{ items: DocumentLookupItem[] }`

Every document the caller can see: `{ id, docId, title, status, parentId, order, reviewState }`, ordered by `order`. Used for the tree, `[[ID]]` links and parent pickers.

### `GET /orgs/:org/documents/next-id?prefix=` → `{ docId }`

Permission `policies.edit`. The next free number for `prefix` (default: the most common prefix, ignoring `SEC`), e.g. `ITD-017`.

### `GET /orgs/:org/documents/export` → `text/csv`

Same filters as the list. `Content-Disposition: attachment; filename="policies-<org>-<date>.csv"`. Columns: ID, Title, Status, Owner, Version, Approved version, Effective, Next review, Last edited.

### `POST /orgs/:org/documents` → 201 `DocumentDetail`

Permission `policies.edit`. Body `CreateDocumentRequest`:

```json
{
  "docId": "ITD-017",
  "title": "Remote Work Policy",
  "parentId": "doc_sec_security",
  "owner": "usr_jehnsen",
  "reviewCycleMonths": 12,
  "requiresApproval": true,
  "classification": "internal",
  "bodyMarkdown": "## 1. Purpose\n…",
  "changeSummary": "First draft."
}
```

Creates version 1 (`type: "create"`) with status `draft`. If `requiresApproval` is false, the document is published straight away (see approve). Validation (400 `fields`):

- `docId`: pattern `^[A-Z][A-Z0-9]{1,9}-\d{3,4}$` (uppercased), unique in the org.
- `title`: 3–160 characters.
- `parentId`: must exist.
- `owner`: an active, non-auditor member.
- `reviewCycleMonths`: 6, 12 or 24.
- `changeSummary`: 3–300 characters.
- `bodyMarkdown`: up to 200,000 characters.

### `GET /orgs/:org/documents/:id` → `DocumentDetail`

`:id` is the document ID or the human `docId`.

### `PATCH /orgs/:org/documents/:id` → `DocumentDetail`

Permission `policies.edit`. Body `UpdateDocumentRequest`: any create fields plus **`ifVersion`** (required).

- 409 `version_conflict` when `ifVersion` ≠ `version`.
- 422 when the document is retired.
- If `title` or `bodyMarkdown` differ from the current version, a new version (`type: "edit"`) is created, and `changeSummary` is required (400 otherwise). Status then becomes `draft` (from `approved` or `in_review`), or the new version is published straight away when `requiresApproval` is false.
- Metadata-only changes don't create a version or change status. Changing `reviewCycleMonths` recalculates `nextReviewDate` from `effectiveDate`.
- Every successful PATCH increments `version`.

### `DELETE /orgs/:org/documents/:id` → 204

Permission `policies.edit`. Only when `approvedVersion === null` and the document has no children; otherwise 422.

### `GET /orgs/:org/documents/:id/versions` → `ListResponse<DocumentVersionSummary>`

Default sort `-version`. No bodies.

### `GET /orgs/:org/documents/:id/versions/:v` → `DocumentVersion`

Includes `bodyMarkdown`. Versions are immutable.

### Workflow

All return the updated `DocumentDetail`. Each accepts an optional `ifVersion` (409 on mismatch) and records a `WorkflowEvent` plus an audit event. Invalid transitions return 422.

| Endpoint             | Permission         | Body                                         | Transition and effects                                                                                                                                                                                                                                             |
| -------------------- | ------------------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST …/:id/submit`  | `policies.edit`    | `{ note? }`                                  | `draft` → `in_review`. Requires `requiresApproval`. Notifies approvers (`approval_requested`).                                                                                                                                                                     |
| `POST …/:id/approve` | `policies.approve` | `{ note? }`                                  | `in_review` → `approved`. Sets `approvedVersion = currentVersion`, `approvedBy`, `approvedAt`, **`effectiveDate` = today in the tenant timezone**, **`nextReviewDate` = effectiveDate + reviewCycleMonths**. Notifies the owner and everyone who must acknowledge. |
| `POST …/:id/reject`  | `policies.approve` | `{ note }` (**required**, 3–2000 characters) | `in_review` → `draft`. Notifies the owner with the note.                                                                                                                                                                                                           |
| `POST …/:id/restore` | `policies.edit`    | `{ version, ifVersion, changeSummary? }`     | Copies that version's title and body into a new version (`type: "restore"`, `restoredFrom`), then follows the same status rule as PATCH. 422 if `version` is already current.                                                                                      |
| `POST …/:id/retire`  | `policies.approve` | `{ note? }`                                  | any → `retired`.                                                                                                                                                                                                                                                   |

### `POST /orgs/:org/documents/reorder` → 204

Permission `policies.edit`. Body `{ parentId: string | null, orderedIds: string[] }`. Moves the listed documents under `parentId` and sets `order` to their index. Doesn't change `version`. 400 if a document would end up under itself.

### Acknowledgements

| Endpoint                             | Permission                            | Response                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET …/:id/acknowledgements`         | `policies.read_drafts`                | `AcknowledgementStatus`: `{ documentId, version, required, acknowledged, members: [{ userId, name, title, roles, acknowledgedAt }] }`. `version` is the approved version (null if none or retired). `members` = active members with `policies.acknowledge`, pending first. |
| `POST …/:id/acknowledgements`        | `policies.acknowledge`                | 201 `Acknowledgement`. Records the caller's acknowledgement of the **approved** version. Idempotent. 422 if there is no approved version.                                                                                                                                  |
| `POST …/:id/acknowledgements/remind` | `policies.edit` or `policies.approve` | `{ reminded: number }`. Notifies pending members (`deadline_review`).                                                                                                                                                                                                      |

---

## Controls (read) — M2

Feature `evidence`, permission `evidence.read`. Writes and evidence arrive in M6.

### `GET /orgs/:org/controls` → `ListResponse<Control>`

Filters: `framework`, `status` (`passing|failing|no_evidence|not_applicable`), `documentId`. `q` searches reference, title and description. Default sort `reference`.

`Control`: `{ framework, reference, title, description, documentIds, owner, evidenceFrequency, status }` plus the base entity fields.

### `GET /orgs/:org/controls/:id` → `Control`

---

## Search additions (M2)

`GET /orgs/:org/search?q=` includes a `document` group ("Policies"). It matches docId, title and the text of the version the caller can read; results link to `/:org/policies/:id`.
