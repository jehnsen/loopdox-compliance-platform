# LoopDox API contract

The frontend defines this contract and the FastAPI backend implements it. TypeScript types for every request and response are in [`lib/api/types.ts`](../lib/api/types.ts), which is the source of truth. The in-repo mock API (`mocks/`) implements the same contract and is the reference behaviour.

> **Status:** covers the endpoints the frontend uses up to **M7 (Ask and Questionnaires)**. Each milestone adds its endpoints here.

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
| 403    | `plan_limit_reached`                     | The tier includes the feature but the org has used its allowance (connectors, M6). The message names the limit.                                   |
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

## Controls (read) — M2, extended in M6

Feature `evidence`, permission `evidence.read`. M6 adds the summary fields below; evidence, connectors and the audit pack are in [Evidence — M6](#evidence--m6).

### `GET /orgs/:org/controls` → `ListResponse<Control>`

Filters: `framework`, `status` (`passing|failing|no_evidence|not_applicable`), `documentId`, `owner`. `q` searches reference, title and description. **Default order:** ISO 27001, then DPA, NPC and internal, and within a framework by reference with numbers compared as numbers (`A.5.2` before `A.5.10`). `sort` may be any of `reference`, `title`, `framework`, `status`, `ownerName`, `evidenceFrequency`, `lastEvidenceAt`, `evidenceCount`.

`Control`: `{ framework, reference, title, description, documentIds, owner, evidenceFrequency, status }` plus the base entity fields. The list and the detail return `ControlSummary`, which adds `ownerName`, `evidenceCount`, `lastEvidenceAt` and `connectors` (`[{ id, provider, name, status }]`: the connectors with a check on this control).

`documentIds` lists only policies the caller may see (**backend must enforce**: an auditor never gets the ID of a draft).

### `GET /orgs/:org/controls/:id` → `ControlSummary`

---

## Search additions (M2)

`GET /orgs/:org/search?q=` includes a `document` group ("Policies"). It matches docId, title and the text of the version the caller can read; results link to `/:org/policies/:id`.

---

## Privacy — M3

Feature `privacy` on every route below (403 `feature_not_in_plan` otherwise). Types are in `lib/api/types.ts`; request bodies are validated with the zod schemas in `lib/schemas/privacy.ts` (400 `validation_error` with `fields`). Every write takes **`ifVersion`** where noted (409 on mismatch), increments `version`, and writes an audit event on the record (`targetType` = `processing_activity`, `pia`, `dsr`, `incident`, `agreement`, `registration`, `training_record`).

### Visibility (backend must enforce)

- Reads need `privacy.read`; writes need `privacy.edit` unless stated.
- **Auditor-only** members see finalised records only: processing records with `status: "approved"`, PIAs with `status: "signed_off"`, DSRs and incidents with `status: "closed"`. Agreements, registrations and training records are always visible. Anything else is **404**.
- DSR requester details are **never** returned in clear: `requesterName` and `requesterContact` are masked in every response (see Sensitive values). They never appear in search, titles, link titles or audit details.

### Display references

`PA-NNN`, `PIA-NNN`, `AGR-NNN` and `RISK-NNN` count per org. `DSR-YYYY-NNNN` and `INC-YYYY-NNNN` count per org and year (tenant timezone). Detail routes accept the ID or the reference.

### Processing records

| Endpoint                            | Notes                                                                                                                                                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /processing-activities`        | `ListResponse<ProcessingActivitySummary>`. `q`: ref, name, purpose, owner. Filters: `status`, `owner`, `legalBasis`, `warning` (`no_pia,no_agreement,no_retention`), `sensitive` (`true`). Default sort `ref`. |
| `GET /processing-activities/export` | CSV of the filtered register. `Content-Disposition: attachment; filename="processing-records-<org>-<date>.csv"`.                                                                                               |
| `POST /processing-activities`       | Body `ProcessingActivityInput` → 201 summary. `retention: ""` is stored as `null`; `crossBorder.countries` is required when `transfers` is true. `owner` must be an active non-auditor member.                 |
| `GET /processing-activities/:id`    | `ProcessingActivitySummary`.                                                                                                                                                                                   |
| `PATCH /processing-activities/:id`  | Full `ProcessingActivityInput` + `ifVersion`.                                                                                                                                                                  |
| `DELETE /processing-activities/:id` | 204. Only `draft` records with no PIA, DSR or incident linking to them (422 otherwise).                                                                                                                        |

`ProcessingActivitySummary` adds: `ownerName`, `updatedByName`, `piaId`/`piaRef`/`piaStatus` (the signed-off PIA for this activity, else the latest), `hasSensitive`, `recipientsWithoutAgreement` (recipients with `kind: "third_party"` and no linked agreement whose `counterparty` equals their name, case-insensitive) and `warnings`:

- `no_pia`: no PIA covers it. `no_agreement`: `recipientsWithoutAgreement` isn't empty. `no_retention`: `retention` is null. Retired records have no warnings.

### Impact assessments (PIA)

| Endpoint                  | Notes                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /pias`               | `ListResponse<PiaSummary>`. Filters `status` (`in_progress,signed_off`), `decision`, `processingActivityId`. Default sort `-updatedAt`.                                                                                                                                                                                |
| `POST /pias`              | Body `{ processingActivityId, scope }` (wizard step 1) → 201, `status: "in_progress"`, `currentStep: 2`.                                                                                                                                                                                                               |
| `GET /pias/:id`           | `PiaSummary` (adds `processingActivityRef`, `processingActivityName`, `signedOffByName`, `updatedByName`).                                                                                                                                                                                                             |
| `PATCH /pias/:id`         | `UpdatePiaRequest`: any of `processingActivityId`, `scope`, `dataFlows`, `risks`, `currentStep`, plus `ifVersion`. `currentStep` only moves forward (the furthest step saved). Recomputes `overallScore` = max(likelihood × impact), or null with no risks. 422 once signed off.                                       |
| `POST /pias/:id/sign-off` | `{ ifVersion, decision, conditions? }`. `conditions` (3+ characters) is required for `proceed_with_conditions`. 422 without at least one risk, or while any risk's `mitigation` is shorter than 3 characters. Sets `signedOffBy/At`, `status: "signed_off"`, `currentStep: 5`; notifies the processing record's owner. |
| `DELETE /pias/:id`        | 204. In-progress PIAs only.                                                                                                                                                                                                                                                                                            |

### Data subject requests

| Endpoint                         | Notes                                                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /dsrs`                      | `ListResponse<DsrSummary>`. `q`: ref, type, assignee. Filters `status`, `type`, `assignee` (user IDs or `none`), `due` (`overdue,due_soon,ok`), `open=true`, `processingActivityId`. Default sort `dueAt`.                                                               |
| `POST /dsrs`                     | `CreateDsrRequest` → 201 `DsrDetail`. `receivedAt` is a calendar date, not after today (tenant timezone). Sets `dueAt` = `receivedAt` + `org.settings.dsrResponseDays` days, `status: "received"`, the first timeline event, and notifies the assignee (`deadline_dsr`). |
| `GET /dsrs/:id`                  | `DsrDetail` (summary + `events`, oldest first).                                                                                                                                                                                                                          |
| `PATCH /dsrs/:id`                | `UpdateDsrRequest`: `type`, `channel`, `description`, `assignee`, `responseNotes`, plus `ifVersion`. 422 when closed. A new assignee is notified.                                                                                                                        |
| `POST /dsrs/:id/transition`      | `{ ifVersion, status, note?, outcome? }`. Only to the **next** status: received → identity_verified → in_progress → responded → closed (422 otherwise). `responded` needs `outcome`. `identity_verified` sets `identityVerified: true`. Appends a timeline event.        |
| `POST /dsrs/:id/files`           | `{ fileId }` (from `POST /files`) → `DsrDetail`.                                                                                                                                                                                                                         |
| `DELETE /dsrs/:id/files/:fileId` | → `DsrDetail`.                                                                                                                                                                                                                                                           |

`DsrSummary` adds `assigneeName`, `daysLeft` (calendar days to `dueAt`, negative when overdue) and `dueState`: `overdue` (past), `due_soon` (within 7 days), `ok`, or `null` once responded or closed.

### Incidents and breaches

| Endpoint                               | Permission               | Notes                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /incidents`                       | `privacy.read`           | `ListResponse<IncidentSummary>`. `q`: ref, title, description. Filters `status`, `severity` (incl. `none`), `personalData` (`true,false`), `open=true`. Default sort `-discoveredAt`.                                                                                                                                         |
| `POST /incidents`                      | **`incidents.report`**   | `ReportIncidentRequest` → 201 **`IncidentReceipt`** `{ id, ref, title, notificationDeadline, createdAt }` (reporters may lack `privacy.read`). `discoveredAt` can't be in the future (5 minutes' slack). Status `reported`; notifies members with `privacy.edit` (`deadline_breach`).                                         |
| `GET /incidents/:id`                   | `privacy.read`           | `IncidentSummary` (adds `reportedByName`, `updatedByName`; `notices` carries `draftedByName` and `signedOffByName`).                                                                                                                                                                                                          |
| `PATCH /incidents/:id`                 | `privacy.edit`           | `UpdateIncidentRequest` + `ifVersion`. See the rules below.                                                                                                                                                                                                                                                                   |
| `POST /incidents/:id/notices/draft`    | `privacy.edit`           | `{ ifVersion }` → `IncidentSummary` with fresh `notices` (any sign-off cleared). 422 without personal data, when `notificationRequired === false`, or after the NPC was notified. Notifies members with `incidents.sign_off` (`approval_requested`).                                                                          |
| `PATCH /incidents/:id/notices`         | `privacy.edit`           | `{ ifVersion, npc?, subjects? }` (`NoticeDraft`: subject 3–200, body 20–20,000 characters). **Clears the sign-off.** 422 before drafting or after the NPC was notified.                                                                                                                                                       |
| `POST /incidents/:id/notices/sign-off` | **`incidents.sign_off`** | `{ ifVersion }`. 422 without notices, when already signed, or unless `notificationRequired === true`. Notifies `privacy.edit` members (`approval_decided`).                                                                                                                                                                   |
| `POST /incidents/:id/notifications`    | `privacy.edit`           | `RecordNotificationRequest` `{ ifVersion, kind: "npc" \| "subjects", at, reference? }`. 422 unless the notices are signed off, or if that kind is already recorded. `at` can't be in the future or before `discoveredAt` (400 on `at`). `npc` sets `npcNotifiedAt` and `npcReference`, and status `notified` (unless closed). |

**The 72-hour rule.** `notificationDeadline` = `discoveredAt` + 72 hours (elapsed time, UTC) whenever `personalDataInvolved` is true, else `null`. Recompute it whenever `discoveredAt` or `personalDataInvolved` changes. The clock is stopped by `npcNotifiedAt`, or shown as not required when `notificationRequired === false`.

**PATCH rules.** Setting any triage field (`severity`, `personalDataInvolved`, `affectedCount`, `notificationRequired`, `notificationRationale`) moves `reported` to `triage`. `status` accepts `reported | triage | contained | closed` and only moves forward (422 otherwise); `contained` and `closed` set `containedAt` if empty. Closing needs `notificationRequired` decided when personal data is involved, and `npcNotifiedAt` when notification was required (422). Closed incidents accept only `postIncidentReview`.

**Notice drafts** are plain text pre-filled from the incident and its links: org name, NPC registration reference, DPO on record (registration, else a member with the `dpo` role), title, description, discovery time (tenant timezone), reporter, processing records (`PA-002 Client project delivery`), their data subjects, data categories and sensitive categories, `affectedCount`, linked systems, and containment time. Unknowns are left as `[bracketed]` prompts.

### Agreements

| Endpoint                 | Notes                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /agreements`        | `ListResponse<AgreementSummary>`. `q`: ref, counterparty, notes. Filters `type`, `role`, `renewal` (`due_soon,overdue,ok,none`), `processingActivityId`. Default sort `renewsAt` (no renewal date last).           |
| `POST /agreements`       | `AgreementInput` → 201. `renewsAt` must be after `signedAt`; `fileId` must be an uploaded file in the org. `processingActivityIds` sets which processing records list this agreement (the link is stored on them). |
| `GET /agreements/:id`    | `AgreementSummary` (adds `ownerName`, `updatedByName`, `file`, `processingActivityIds`, `renewalState`: `due_soon` within 30 days, `overdue` once passed, `null` with no renewal date, and `daysToRenewal`).       |
| `PATCH /agreements/:id`  | `AgreementInput` + `ifVersion`. A later `renewsAt` is audited as `agreement.renewed`.                                                                                                                              |
| `DELETE /agreements/:id` | 204; unlinks it from processing records.                                                                                                                                                                           |

### NPC registration and training

| Endpoint                       | Notes                                                                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /registrations`           | `ListResponse<RegistrationSummary>`; `status` is `registered`, `renewal_due` (within 30 days) or `expired`, plus `daysToRenewal`.                     |
| `POST /registrations`          | `RegistrationInput` → 201. **One per organisation** (422 if one exists).                                                                              |
| `GET/PATCH /registrations/:id` | PATCH takes `RegistrationInput` + `ifVersion`. A later `renewsAt` is audited as `registration.renewed`; history = the record's audit events.          |
| `GET /training-records`        | `ListResponse<TrainingRecordSummary>` (adds `userName`, `state`: `valid`, `expiring` within 30 days, `expired`). Filters `userId`, `course`, `state`. |
| `POST /training-records`       | `TrainingRecordInput` → 201. `userId` must be an active non-auditor member; `expiresAt` after `completedAt` or null.                                  |
| `PATCH /training-records/:id`  | `TrainingRecordInput` + `ifVersion`.                                                                                                                  |
| `DELETE /training-records/:id` | 204.                                                                                                                                                  |

### Linked records

The relation table (which side stores each link) is `LINK_RELATIONS` in `lib/links.ts`:

| Owner               | Field                                                          | Target                                      |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| processing_activity | `systemIds`                                                    | system                                      |
| processing_activity | `agreementIds`                                                 | agreement                                   |
| pia                 | `processingActivityId` (single, managed by the PIA)            | processing_activity                         |
| dsr                 | `processingActivityIds`                                        | processing_activity                         |
| incident            | `processingActivityIds`, `systemIds`, `documentIds`, `riskIds` | processing_activity, system, document, risk |

| Endpoint                                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /links?type=&id=`                          | `LinksResponse` `{ groups: LinkGroup[] }`: one group per relation the record takes part in, **in both directions**, including empty groups, leaving out types whose module the plan lacks (`system`, `risk` need `security`; `document` needs `policies`). Items are `RecordRef` + `direction` (`to` = this record holds the link, `from` = the other record does), filtered to what the caller may see. `linkable` = the caller has `privacy.edit` and the relation isn't managed. 404 if the caller can't see the record. |
| `GET /links/candidates?type=&q=&for=type:id`    | `{ items: RecordRef[] }`: up to 20 visible records of `type` matching `q` (ref or title), leaving out those already linked to `for`. With `ids=a,b` instead, returns those records (for showing a form's current links).                                                                                                                                                                                                                                                                                                    |
| `POST /links`                                   | `{ from: { type, id }, to: { type, id } }` → 204. Finds the relation in either direction and adds the ID on the owner. Idempotent; bumps the owner's `version`; no `ifVersion`. 422 for unrelated types or managed relations; 403 without `privacy.edit`. Audits `<ownerType>.linked` with the target's `{ type, id, ref, title }`.                                                                                                                                                                                         |
| `DELETE /links?fromType=&fromId=&toType=&toId=` | 204. Same rules; audits `<ownerType>.unlinked`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

`RecordRef`: `{ type, id, ref, title, href, status }`. DSR titles are `"<Type> request"`, never the requester.

### Sensitive values

`POST /sensitive/reveal` — permission `sensitive.reveal` (owner, admin, DPO) and `privacy.read`. Body `{ targetType: "dsr", targetId, field: "requesterName" | "requesterContact" }` → `{ value }`. Writes `sensitive.revealed` on the record with `{ field }` (never the value). Masks used in responses: names as initials (`M•••• C•••• D•••• C••••`), emails as first letter + domain (`m••••@mail.example`), anything else as the last 4 characters (`•••• 0142`).

### Files

| Endpoint         | Notes                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /files`    | `multipart/form-data` with `file`. Needs `privacy.edit`, `security.edit` or `evidence.edit`. Up to 10 MB; PDF, PNG, JPEG, text, CSV, DOCX, XLSX (400 on `file` otherwise). → 201 `FileRef` `{ id, name, size, contentType, uploadedAt, uploadedBy }`. |
| `GET /files/:id` | The file, with `Content-Disposition: attachment`. (The mock keeps metadata only and returns a placeholder text file.)                                                                                                                                 |

### Risks created from incidents

`POST /risks` — feature `security`, permission `security.edit`. `CreateRiskRequest` `{ title, description, likelihood, impact, owner, incidentId? }` → 201 `Risk` (`ref` `RISK-NNN`, `inherentScore` = likelihood × impact, `treatment: "mitigate"`, `status: "open"`, `reviewAt` = today + 3 months). With `incidentId` (caller also needs `privacy.edit`), the risk is added to the incident's `riskIds`. The risk register endpoints arrive in M5.

### Search additions (M3)

`GET /orgs/:org/search?q=` adds groups `processing_activity` ("Processing records"), `pia`, `dsr`, `incident` and `agreement`, matching ref and title (plus purpose, scope, description or notes). DSRs match by ref and type only.

### Audit actions (M3)

`processing_activity.created|updated|deleted|linked|unlinked`, `pia.created|updated|signed_off|deleted`, `dsr.created|updated|identity_verified|in_progress|responded|closed|file_attached|file_removed|linked|unlinked`, `sensitive.revealed`, `incident.reported|triaged|updated|contained|closed|notices_drafted|notices_edited|notices_signed_off|npc_notified|subjects_notified|linked|unlinked`, `agreement.created|updated|renewed|deleted`, `registration.created|updated|renewed`, `training.recorded|updated|deleted`, `risk.created`.

## Overview and search — M4

### `GET /orgs/:org/overview` → 200 `OverviewResponse`

The Overview dashboard in one call. Any active member may call it; each block is filtered to what the caller may see, and the plan gates the same way the modules do.

```json
{
  "generatedAt": "2026-10-15T03:00:00.000Z",
  "documents": { "total": 16, "approved": 13, "in_review": 1, "draft": 2, "retired": 0 },
  "attention": {
    "total": 5,
    "counts": { "breach_deadline": 1, "dsr_due": 1, "policy_approval": 1 },
    "items": [
      {
        "id": "breach_deadline:inc_2026_0003",
        "kind": "breach_deadline",
        "tone": "warn",
        "ref": "INC-2026-0003",
        "title": "Client database backup exposed in a public storage container",
        "detail": "Decide whether NPC notification is required",
        "badge": null,
        "deadline": "2026-10-17T21:00:00.000Z",
        "href": "/3rdloop/privacy/incidents/inc_2026_0003"
      }
    ]
  },
  "controlCoverage": [
    { "framework": "ISO27001:2022", "passing": 20, "failing": 2, "no_evidence": 4, "total": 26 }
  ],
  "recentActivity": [
    {
      "id": "aud_…",
      "actor": { "id": "usr_jehnsen", "name": "Jehnsen Enrique" },
      "action": "document.submitted",
      "targetType": "document",
      "targetLabel": "ITD-007 Access Control Policy",
      "href": "/3rdloop/policies/doc_itd_007",
      "at": "2026-10-15T01:00:00.000Z",
      "details": { "version": 3 }
    }
  ]
}
```

**`documents`**: controlled documents the caller can read, counted by status. Section pages (`SEC-…`) are left out. Callers without `policies.read_drafts` count only the approved versions they can see (same projection as `GET /documents`). `null` without `policies.read` or the Policies plan.

**`attention`**: what needs doing, **most serious class first**: `breach_deadline`, `dsr_due`, `policy_approval`, `secret_rotation`, `access_review`, `connector_failing`, `review_overdue`, `agreement_renewal`; within a class, overdue (`tone: "bad"`) before upcoming (`"warn"`), then by how soon. `total` and `counts` cover the whole list (the UI collapses long lists itself). **Empty for staff-only and auditor-only members.** Each item's `href` opens the record it names. A source module contributes items only to callers who can open its records.

| Kind                | When an item exists                                                                                                                     | `tone`                                    | Extra                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `breach_deadline`   | Incident not closed, personal data involved, NPC not yet notified, `notificationRequired !== false`. Needs `privacy.read`.              | `bad` under 6 h left or past; else `warn` | `deadline` = `notificationDeadline`. `detail` says "Decide whether…" while undecided.    |
| `dsr_due`           | Request `received`, `identity_verified` or `in_progress` and due within 7 days or late. Title is the request type, never the requester. | `bad` when overdue; else `warn`           | `badge` "Assigned to you" for the assignee.                                              |
| `policy_approval`   | Document `in_review`. Needs `policies.read_drafts`.                                                                                     | `warn`                                    | `badge`: "Ready for your decision" with `policies.approve`, else "Waiting for approval". |
| `review_overdue`    | Approved document whose `nextReviewDate` has passed. Needs `policies.read_drafts`.                                                      | `bad`                                     | `badge` "You own this" for the owner.                                                    |
| `agreement_renewal` | Agreement with `renewsAt` within 30 days or past.                                                                                       | `bad` when past; else `warn`              |                                                                                          |
| `secret_rotation`   | _M5_: secret record past `nextDueAt`.                                                                                                   |                                           |                                                                                          |
| `access_review`     | _M5_: access review due or in progress past its period.                                                                                 |                                           |                                                                                          |
| `connector_failing` | _M6_: connector with status `error`.                                                                                                    |                                           |                                                                                          |

**`controlCoverage`**: per framework, controls by status (`not_applicable` excluded; `total` = passing + failing + no_evidence). `null` on plans without Evidence or without `evidence.read`.

**`recentActivity`**: the 10 latest audit events on records the caller can open (plus the registration and training pages for `privacy.read`), newest first; `href` is null for events without a page. People with `audit_log.read` also get org-level events. `sensitive.*` events are for `audit_log.read` only. `null` for staff-only and auditor-only members.

### Search changes (M4)

`GET /orgs/:org/search?q=&type=&limit=`

- **Every word must match.** `q` is split on whitespace; a record matches when each word appears in its ID, title or text (case-insensitive). Snippets mark every matching word with `«…»`.
- **Ranking inside a group:** exact ID, then ID match, then title match, then body text only.
- `type` (repeatable or comma-separated `SearchResultType`) restricts the groups returned. `limit` is the maximum results per group: default 8, at most 50.
- Each group gains `total`: the number of matches, so the UI can offer "Show all N".
- Group order is fixed: `document`, `processing_activity`, `pia`, `dsr`, `incident`, `agreement`, `system`, `secret_record`, `change`, `risk`, `decision`, `control`, `evidence`, `ai_use_case`.
- New searchable types: `system` and `risk` (plans with Security; visible to `security.read` or `privacy.read`), and `control` (plans with Evidence, `evidence.read`: reference, title, framework and description; links to `/:org/evidence/controls/:id`). Evidence items joined in M6 (below).
- DSRs still match by reference and type only. Requester details never appear.

## Security — M5

Every endpoint needs the **Security** plan (Pro and above; Starter gets 403 `feature_not_in_plan`). Reads need `security.read` (owner, admin, DPO, CTO, approver, auditor). Writes need `security.edit` (owner, admin, CTO). Lists follow the shared list conventions (`page`, `pageSize`, `sort`, `q`, filters). Updates send `ifVersion` and return 409 on a mismatch.

### Display references

`SYS-001` systems, `AR-001` access reviews, `SCR-001` secret records, `CHG-001` changes, `RISK-001` risks, `ADR-001` decisions: per organisation, next number = highest + 1. Access grants have no display ID. `GET …/:id` also accepts the display ID.

### Systems

| Endpoint              | Notes                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /systems`        | → `ListResponse<SystemSummary>` (`ownerName`, `updatedByName`, `grantCount` = active grants, `secretCount`). `q` searches ref, name, provider, hosting, notes. Filters: `type`, `classification`, `personalData`. Default sort `name`. |
| `POST /systems`       | `SystemInput` → 201 `SystemSummary`. `owner` must be an active, non-auditor member.                                                                                                                                                    |
| `GET /systems/:id`    | `SystemSummary`.                                                                                                                                                                                                                       |
| `PATCH /systems/:id`  | `SystemInput` + `ifVersion`.                                                                                                                                                                                                           |
| `DELETE /systems/:id` | 204. **422** while anything still points at it: active access grants, secret records, changes, decisions, processing records or incidents. The message lists what.                                                                     |

### Access grants

`AccessGrant`: `systemId`, `userId` **or** `externalName` (exactly one), `level` (`owner | admin | write | read`), `approvedBy`, `grantedAt`, `lastReviewedAt`, `status` (`active | revoked`), `revokedAt`, `notes`. `AccessGrantSummary` adds `systemName`, `systemRef`, `personName`, `personKey` (user ID, or `ext:` + lower-cased name), `approvedByName`.

| Endpoint                         | Notes                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /access-grants`             | Active grants unless `status=revoked` or `status=all`. Filters: `system`, `person` (a `personKey`), `level`, `external` (`true                                | false`). `q`searches person, system, notes. Default sort`systemName`. |
| `POST /access-grants`            | `AccessGrantInput` → 201. 422 when the person already has an active grant on that system (field `userId`). 400 unless `userId` xor `externalName`.            |
| `PATCH /access-grants/:id`       | Changes `level`, `approvedBy`, `grantedAt`, `notes` (+ `ifVersion`). 422 if the system or person differs: revoke and add a new grant. 422 on a revoked grant. |
| `POST /access-grants/:id/revoke` | `{ ifVersion }` → `AccessGrantSummary` with `status: "revoked"`. The grant stays on record. 422 if already revoked.                                           |

### Access reviews

`AccessReview`: `ref`, `period` (`2026-Q4`), `dueAt` (last day of the period), `systemIds`, `reviewer`, `items[]`, `status` (`in_progress | signed_off`), `signedOffAt`, `signedOffBy`, `evidenceId`. Each item snapshots the grant when the review starts: `grantId`, `systemId`, `systemName`, `personName`, `level`, plus `decision` (`keep | revoke | change | null`), `note`, `newLevel`, `decidedBy`, `decidedAt`. `AccessReviewSummary` adds `reviewerName`, `signedOffByName`, `systemNames`, `decided`, `total`, `counts` per decision, `dueState`, `daysLeft` and the `evidence` item once signed off.

| Endpoint                                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /access-reviews`, `GET …/:id`        | Filter `status`. Default sort `-period`.                                                                                                                                                                                                                                                                                                                                                                              |
| `POST /access-reviews`                    | `{ period, systemIds[], reviewer }` → 201. Items are the active grants of those systems. 422 when a review for that period is already in progress, or the systems have no active grants.                                                                                                                                                                                                                              |
| `POST /access-reviews/:id/items/:grantId` | `{ ifVersion, decision, note?, newLevel? }`. `decision: null` clears. 400 on `note` when revoking without a reason; 400 on `newLevel` when changing without one. 422 once signed off.                                                                                                                                                                                                                                 |
| `POST /access-reviews/:id/keep-all`       | `{ ifVersion, grantIds? }` marks every undecided item (or just those listed) as keep.                                                                                                                                                                                                                                                                                                                                 |
| `POST /access-reviews/:id/sign-off`       | `{ ifVersion }`. 422 while any item is undecided. **Applies the decisions:** revoked grants become `revoked`, changed grants take `newLevel`, every reviewed active grant gets `lastReviewedAt` = today. **Creates one `Evidence` item** (`source: "manual"`, `result: "pass"`) on the control with reference **A.5.15 Access control**, with `origin` pointing back at the review. Audit `access_review.signed_off`. |

### Secret records

`SecretRecord`: `ref`, `name`, `location` ("Azure Key Vault: kv-prod"), `systemId`, `owner`, `lastRotatedAt`, `rotationDays` (1–730), `nextDueAt` (= `lastRotatedAt` + `rotationDays`, stored), `notes`. Summary adds `systemName`, `ownerName`, `dueState` (`due_soon` = within 14 days), `daysLeft`.

**LoopDox stores where a secret lives, never its value.** Create and update refuse a body that carries `value`, `secret`, `password`, `token`, `apiKey` or `key`: **400** with that field in `fields`.

| Endpoint                                       | Notes                                                                                                     |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /secret-records`                          | Default sort `nextDueAt` (overdue first). Filters: `system`, `due` (`overdue                              | due_soon | ok`), `owner`. |
| `POST`, `GET/PATCH/DELETE /secret-records/:id` | As for other registers.                                                                                   |
| `POST /secret-records/:id/mark-rotated`        | `{ ifVersion, rotatedAt? }`: `lastRotatedAt` = today (or the earlier date given), `nextDueAt` recomputed. |

### Changes

`Change`: `ref`, `source` (`github_pr | deploy | manual`), `externalUrl`, `systemId`, `summary`, `approver` (null only for an emergency change), `deployedAt`, `rollbackPlan`, `emergency`, `reviewNote`, `reviewedAt`, `reviewedBy`. Summary adds `systemName`, `approverName`, `reviewedByName`, `reviewState` (`not_required | pending | overdue | done`) and `reviewDueAt` (= `deployedAt` + 48 hours, emergency only). `deployedAt` can't be in the future (5 minutes' slack).

| Endpoint                                  | Notes                                                                                                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /changes`                            | Default sort `-deployedAt`. Filters: `source`, `system`, `emergency`, `review`.                                                                                              |
| `POST /changes`, `GET/PATCH /changes/:id` | There is no delete: the log is a record. 400 on `approver` unless emergency.                                                                                                 |
| `POST /changes/:id/review`                | `{ ifVersion, note }` (at least 10 characters). 422 unless the change is an emergency change not yet reviewed. Audit `change.reviewed` notes `late` when after the 48 hours. |

### Risks

`Risk` gains `residualLikelihood` and `residualImpact` (both or neither); `residualScore` is derived. `RiskSummary` adds `ownerName`, `reviewState` (`due_soon` within 30 days, `overdue`; null when closed or fine) and `daysToReview`.

| Endpoint               | Notes                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /risks`           | Default sort `-inherentScore`. Filters: `status`, `treatment`, `review`, `band` (`low                                                                                                                                                                                                                                                                                        | medium | high | critical`), and the heat-map filter `cell=3x5`(likelihood × impact).`basis=residual`makes`cell`and`band` use the residual rating (default inherent). |
| `POST /risks`          | The full `RiskInput`, **or** the short M3 form `{ title, description, likelihood, impact, owner, incidentId? }`; omitted fields default (`treatment: mitigate`, `status: open`, `reviewAt` = today + 3 months). `documentIds` must be policies the caller can read, `controlIds` controls in the org (400). With `incidentId` the risk is added to the incident's `riskIds`. |
| `GET/PATCH /risks/:id` | `PATCH` takes the full `RiskInput` + `ifVersion`.                                                                                                                                                                                                                                                                                                                            |
| `DELETE /risks/:id`    | 204. Removes the risk from any incident's `riskIds`.                                                                                                                                                                                                                                                                                                                         |

### Decisions (ADRs)

`Decision`: `ref`, `title`, `context`, `decision`, `consequences`, `status` (`proposed | accepted | superseded`), `decidedBy`, `decidedAt`, `systemIds`, `supersededBy`, `supersedes`. Summary adds `decidedByName`, `supersededByRef`, `supersedesRef`.

| Endpoint                        | Notes                                                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /decisions`                | Default sort `-ref`. Filters: `status`, `system`. `q` searches ref, title, context, decision and consequences.                                                                                                                                  |
| `POST /decisions`               | `DecisionInput` (`status: proposed                                                                                                                                                                                                              | accepted`) → 201. |
| `GET /decisions/:id`            |                                                                                                                                                                                                                                                 |
| `PATCH /decisions/:id`          | + `ifVersion`. 422 on a superseded decision.                                                                                                                                                                                                    |
| `DELETE /decisions/:id`         | 204. **422 unless `proposed`**: accepted decisions are superseded, not deleted.                                                                                                                                                                 |
| `POST /decisions/:id/supersede` | The new decision as the body (`DecisionInput` fields + the old decision's `ifVersion`). 201 with the new, **accepted** decision (`supersedes` set). The old one becomes `superseded` with `supersededBy`. 422 unless the old one is `accepted`. |

### Controls and evidence

`GET /controls/:id/evidence` — `evidence.read`, Evidence plan. → `ListResponse<EvidenceItem>`, default sort `-collectedAt`; filters `result`, `source`. `Evidence`: `controlId`, `source` (`connector | upload | manual`), `connectorId`, `collectedAt`, `result` (`pass | fail | info`), `summary`, `fileId`, `origin` (`{ type: "access_review", id, label }` or null). `EvidenceItem` adds `collectedByName`, `file` and `originHref`. M6 adds `controlReference`, `controlTitle` and `connectorName` to `EvidenceItem`, uploads and connectors (see [Evidence — M6](#evidence--m6)).

### Links and search (M5)

`RecordType` gains `access_grant`, `secret_record`, `change`, `decision` and `control`. New relations (stored on the first record): access grant, secret record and change → `system` (single, **managed** by their own forms); decision → `system`; risk → `document` and → `control`. A relation is edited with `security.edit` when its owner is a security record and `privacy.edit` otherwise, and only when the owner's type is in the plan (`POST` and `DELETE /links` are no longer limited to the Privacy plan). `GET /links?type=system&id=…` therefore returns groups for access grants, secrets, changes and decisions as well as processing records and incidents.

`GET /search` adds `system` (now with its `SYS-` ref, provider and hosting), `risk`, `secret_record`, `change` and `decision`. Secret records match on name, ref and location, never a value. Grants aren't searched.

### Dashboard (M5)

`GET /overview` gains attention kinds `secret_rotation` (a secret past `nextDueAt`; always `tone: "bad"`) and `access_review` (a review `in_progress`; `tone: "bad"` once its period has ended; `detail` reads "6 of 11 decided · Due in 77 days").

### Audit actions (M5)

`system.created|updated|deleted`, `access_grant.created|updated|level_changed|revoked`, `access_review.created|signed_off`, `secret.created|updated|rotated|deleted`, `change.logged|updated|reviewed`, `risk.created|updated|closed|deleted`, `decision.created|accepted|updated|superseded|deleted`.

## Evidence — M6

Feature `evidence` (Pro and above; Starter gets 403 `feature_not_in_plan`). Reads need `evidence.read` (owner, admin, DPO, CTO, approver, **auditor**). Writes need `evidence.edit` (owner, admin, DPO, CTO). Types are in `lib/api/types.ts`; request bodies are validated with `lib/schemas/evidence.ts`.

### Control status

A control's `status` follows its evidence. The newest `pass` or `fail` (by `collectedAt`) decides: `pass` → `passing`, `fail` → `failing`. `info` never changes it. No pass or fail → `no_evidence`. `not_applicable` is set by people and never overwritten. Re-judge the control after **every** evidence write (upload, connector run, access review sign-off), including a backdated one. The status isn't aged by `evidenceFrequency`.

### Evidence

`Evidence`: `controlId`, `source` (`connector | upload | manual`), `connectorId`, `checkId` (connector evidence), `collectedAt`, `result` (`pass | fail | info`), `summary`, `fileId`, `origin`. `EvidenceItem` adds `controlReference`, `controlTitle`, `collectedByName` (null for connector evidence), `file`, `connectorName` and `originHref`. Evidence is **never edited or deleted**.

| Endpoint                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /controls/:id/evidence` | As in M5. `q` also searches the connector name and the file name.                                                                                                                                                                                                                                                                                                                                                  |
| `GET /evidence`              | Every item in the org. Default sort `-collectedAt`. Filters: `source`, `result`, `controlId`. `q` searches summary, control reference and title, connector name, file name and who recorded it. The Uploads page calls it with `source=upload`.                                                                                                                                                                    |
| `POST /evidence`             | `multipart/form-data`: `file` (required; same type and size rules as `POST /files`) and `controlId`, `summary` (10–500 characters), `result` (`pass \| fail \| info`), `collectedOn` (optional `2026-10-14`). 400 with `fields` on any of them (the future is refused). Today means now; an earlier date is stored at 12:00 in the org's timezone. → 201 `EvidenceItem`. Audit `evidence.uploaded` on the control. |

### Connectors

`Connector`: `provider` (`github | azure | google_workspace | hostinger`), `status` (`connected | error | disconnected`), `account` (the organisation, tenant or domain connected; **never a credential**), `connectedAt`, `lastRunAt`, `lastError` (`{ message, fixHint, at }` or null) and `checks[]` (`{ id, name, controlId, controlReference, lastResult: "pass" \| "fail" \| null, detail, checkedAt }`). Each organisation has one record per provider; `disconnected` means not set up yet. The checks each provider performs are listed in `lib/evidence.ts`.

`status: "error"` means the connector couldn't reach its provider. A check that **fails** is different: the connector stays `connected` and the evidence item has `result: "fail"`.

| Endpoint                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /connectors`          | `ListResponse<Connector>` in the order GitHub, Azure, Google Workspace, Hostinger. `evidence.read`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `GET /connectors/:id`      | The ID, or the provider name.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `PATCH /connectors/:id`    | `{ ifVersion, status: "connected" \| "disconnected", account? }`. **Connect / Reconfigure:** `status: "connected"` with `account` (kept if omitted; 400 if there is none). Clears `lastError`. A **new** connection (from `disconnected`) is refused with **403 `plan_limit_reached`** at the plan's limit; reconfiguring takes no new slot. **Disconnect** clears `account`; evidence already collected stays. A body with `token`, `password`, `apiKey`, `key`, `secret`, `value` or `clientSecret` is **refused with 400**. Audit `connector.connected \| disconnected`. |
| `POST /connectors/:id/run` | `evidence.edit`. → `ConnectorRunResult` `{ connector, ok, evidence[] }`. Connected: runs every check, records **one evidence item per check** (`source: "connector"`, `connectorId`, `checkId`) and updates each check's `lastResult`. Error: `200` with `ok: false`, nothing collected, `lastError` kept. Disconnected: **422**. Audit `connector.run` (`checks`, `failed`) or `connector.run_failed`.                                                                                                                                                                     |

`GET /me` `usage.connectors` counts connectors that are `connected` or `error`. Limits: Pro 3, Premium unlimited.

`GET /overview` gains the attention kind `connector_failing` (a connector in `error`; `tone: "bad"`, `ref: null`, `detail` = the error message, `href` = `/:org/evidence/connectors`), for callers with `evidence.edit`. It ranks after `access_review` and before `review_overdue`.

### Audit pack

| Endpoint                 | Notes                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /audit-pack`        | `evidence.read`. Query: `from`, `to` (inclusive `2026-10-14`, in the org's timezone; either may be omitted; 400 if `from` is after `to`), `framework` (comma-separated). → `AuditPack`: `{ from, to, generatedAt, totals: { controls, passing, failing, no_evidence, evidence }, controls: AuditPackControl[] }`, ordered like `GET /controls`. |
| `GET /audit-pack/export` | Same query. The mock returns a CSV (`Content-Disposition: audit-pack-<org>-<from>_to_<to>.csv`), one row per evidence item and one row for a control with none. **The backend should return a zip** of the register and the evidence files. Audit `audit_pack.exported` with the period.                                                        |

`AuditPackControl`: `{ control, periodStatus, policies[], evidence[] }`. `periodStatus` is judged from the evidence **inside the period** with the same rule as a control's status (so a control with nothing in the period is `no_evidence`). `evidence` is the period's items, newest first. `policies` lists, for each policy linked to the control, its **approved version on record**: `{ id, docId, title, version, approvedAt, approvedByName, effectiveDate, href }`.

**Backend must enforce:** a policy that has never been approved, or is retired, is never listed, whoever asks. Callers who can't read drafts (auditors) only get policies they can see, at the approved version, as in the Visibility rule for documents.

### Search and audit actions (M6)

`GET /search` adds `evidence` (plans with Evidence, `evidence.read`): `ref` is the control's reference, `title` the summary (cut at 100 characters), `href` is `/:org/evidence/controls/:controlId#:evidenceId`. The text searched includes the control title, connector name and file name.

New audit actions: `evidence.uploaded`, `connector.connected`, `connector.disconnected`, `connector.run`, `connector.run_failed`, `audit_pack.exported`.

---

## Ask — M7

Feature `ask.policy` (every plan except VisorShield-only), permission `ask.use`. Types: `AskRequest`, `AskStreamEvent`, `AskMessage`, `AskThread`, `AskThreadDetail`, `Citation` in `lib/api/types.ts`.

### Answer rules (backend must keep)

- Every statement in an answer carries a citation marker `[n]` that refers to a `citation` event. **An answer with no citations must set `grounded: false`** and say it couldn't find the answer; the UI never shows an uncited answer as fact.
- Policy answers quote **approved** versions only (or, with `asOf`, the version in force at the end of that day in the tenant's timezone). `Citation.href` for a policy section is `/:org/policies/:id#<heading-anchor>` when the quoted version is the document's current version, else `/:org/policies/:id/versions/:v#<heading-anchor>`. Heading anchors are GitHub-slugger IDs of the rendered headings.
- Records answers cite only records the caller can see. Auditor-only guests: approved policies, controls and evidence.

### `POST /orgs/:org/ask` → `text/event-stream`

Body `AskRequest`:

| Field      | Notes                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `question` | 3–1000 characters                                                                                                                                                                    |
| `threadId` | Continue a conversation; omit to start one. Another user's thread → 404.                                                                                                             |
| `route`    | `policy` \| `records` \| `impact`, or omit for automatic routing. `records`/`impact` need `ask.records`/`ask.impact` (403 `feature_not_in_plan`); auditors can't pin `impact` (403). |
| `asOf`     | `YYYY-MM-DD`, not in the future (400 `fields.asOf`).                                                                                                                                 |
| `context`  | `{ type: RecordType, id }`: the page Quick Ask was opened from.                                                                                                                      |

Errors **before** the stream are JSON: 400, 403 (`forbidden`, `feature_not_in_plan`, `plan_limit_reached` when the month's questions are used up), 404. Each accepted question counts once against `usage.askQuestions`.

Stream (`event:` name, `data:` JSON), in order:

| Event      | Data                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route`    | `{ route }`                                                                                                                                               |
| `citation` | `Citation` `{ n, kind: policy_section\|record\|evidence, label, href, docId?, version?, sectionId?, excerpt }`, sent before the first token that cites it |
| `token`    | `{ text }`; concatenate in order. The text is Markdown-lite with `[n]` markers.                                                                           |
| `done`     | `{ messageId, threadId, userMessageId, grounded, suggestions[], usage: { used, limit, periodStart } }`                                                    |
| `error`    | `{ code, message }`; the stream ends without `done`.                                                                                                      |

Mock: `?simulate=stream_error` sends an `error` part-way.

### `GET /orgs/:org/ask/threads` → `ListResponse<AskThread>`

The caller's own conversations. Default sort `-updatedAt`; `q` searches titles.

### `GET /orgs/:org/ask/threads/:id` → `AskThreadDetail`

Messages oldest first. 404 for another user's thread.

### `DELETE /orgs/:org/ask/threads/:id` → 204

### `POST /orgs/:org/ask/messages/:id/feedback` → `AskMessage`

Body `{ rating: "up" | "down", note? }` (note up to 1000 characters). The asker's own answers only (404 otherwise); a new rating replaces the old one.

---

## Questionnaires — M7

Feature `questionnaires` (Pro and Premium). Read: `questionnaires.read`; write: `questionnaires.edit`. Types: `QuestionnaireSummary`, `Questionnaire`, `QuestionnaireRow`, `QuestionnaireMapping`, `QuestionnaireRowResult`.

### `GET /orgs/:org/questionnaires` → `ListResponse<QuestionnaireSummary>`

Filter `status` (`mapping`, `in_review`, `complete`); `q` searches name, client, file name. Default sort `-uploadedAt`. Each summary has `progress { total, approved, edited, draft, needsInput }`.

### `POST /orgs/:org/questionnaires` (multipart) → 201 `Questionnaire`

Fields `file` (CSV or XLSX, up to 10 MB and 500 rows), `name` (3–160), `client` (2–160). The backend parses the first worksheet; the first non-empty row is the header. The response is in status `mapping`, with `columns`, `preview` (first 5 rows) and `suggestedMapping`. 400 `fields.file` for an unreadable, empty or unsupported file.

### `GET /orgs/:org/questionnaires/:id` → `Questionnaire`

### `POST /orgs/:org/questionnaires/:id/mapping` → `Questionnaire`

Body `{ ifVersion, questionColumn, answerColumn | null }` (`null` appends an "Answer" column on export). Drafts an answer for every row with a question: approved policy text with `citations`, or an empty answer with status `needs_input`. 422 once any answer has been edited or approved.

### `PATCH /orgs/:org/questionnaires/:id/rows/:rowId` → `QuestionnaireRowResult`

Body `{ ifVersion, draftAnswer?, status? }`. `ifVersion` is the **row's** `version` (409 on mismatch). Changing the text without a status sets `edited`. `approved` needs a non-empty answer (422); a reviewed row can't return to `draft` (422). The response adds the questionnaire's new `questionnaireStatus` (`complete` when every row is approved) and `progress`.

### `DELETE /orgs/:org/questionnaires/:id` → 204

### `POST /orgs/:org/questionnaires/:id/export` → file

The client's file in its original format (`text/csv` or the XLSX type), named `<original name> (answered).<ext>` (`Content-Disposition` with an RFC 6266 `filename*`). Every non-empty answer is written to the mapped answer column with citation markers removed; other cells are unchanged. Permission `questionnaires.read`; audit-logged. 422 before mapping.

---

## AI Governance — M8

Feature `aiGovernance` (Premium, and VisorShield-only tenants; everyone else gets 403 `feature_not_in_plan`). Reads need `ai.read` (owner, admin, DPO, CTO, approver, **auditor**). Writes need `ai.edit` (owner, admin, DPO, CTO). Lists follow the shared conventions. Updates send `ifVersion` and return 409 on a mismatch. Types are in `lib/api/types.ts`; request bodies are validated with `lib/schemas/ai.ts`; the question set, recognizers and guardrails are listed in `lib/ai.ts`.

### Use cases

`AiUseCase`: `ref` (`AI-NNN`), `name`, `tool`, `provider`, `model`, `purpose`, `dataCategories[]`, `systemIds[]`, `processingActivityIds[]`, `riskLevel` (`low | medium | high`), `owner`, `status` (`proposed | approved | rejected | retired`), `notes`. `AiUseCaseSummary` adds `ownerName`, `updatedByName`, `systemNames`, `processingRefs`, `assessmentState` (`none | in_progress | decided`), `latestAssessment` (`{ id, ref, decision, riskLevel, decidedAt, humanOversight, conditions }`) and `openAssessmentId`.

| Endpoint                   | Notes                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ai/use-cases`        | Default sort `ref`. Filters: `status`, `risk`, `assessment` (`none,in_progress,decided`), `owner`. `q` searches ref, name, tool, provider, model, purpose and data categories.                                                                    |
| `POST /ai/use-cases`       | Name, tool, provider, model, purpose (at least 10 characters), `dataCategories`, `riskLevel`, `owner` (an active non-auditor member), `notes` → 201, `status: "proposed"`. Systems and processing records are linked afterwards through `/links`. |
| `GET /ai/use-cases/:id`    | The ID or the reference.                                                                                                                                                                                                                          |
| `PATCH /ai/use-cases/:id`  | The same fields + `ifVersion`, and optional `status`. **Only `retired` and `proposed` (reopen) are accepted**; approval and rejection come from an assessment (400 otherwise).                                                                    |
| `DELETE /ai/use-cases/:id` | 204. 422 unless the use case is `proposed` and has no decided assessment; anything else is retired. Deletes its in-progress assessments.                                                                                                          |

`ai_use_case` is a link record type: relations `systemIds` → system and `processingActivityIds` → processing record are stored on the use case and edited with `ai.edit` (`GET`/`POST`/`DELETE /links`). Search adds the `ai_use_case` group (ref, name, tool, provider, model, purpose, data categories), linking to `/:org/ai-governance/inventory/:id`.

### Assessments

`AiAssessment`: `ref` (`AIA-NNN`), `useCaseId`, `status` (`in_progress | decided`), `questions[]` (`{ id, q, answer: "yes" | "no" | "unsure" | null, note }`), `riskLevel`, `humanOversight`, `oversightNote`, `decision` (`approved | approved_with_conditions | rejected`), `conditions`, `decidedBy`, `decidedAt`. `AiAssessmentSummary` adds `useCaseRef`, `useCaseName`, `decidedByName`, `suggestedRisk`, `answered`, `total`.

The question set is fixed (8 questions, worded so "Yes" is the riskier answer). `suggestedRisk`: "Yes" adds the question's weight, "Not sure" half, unanswered nothing; under 3 is `low`, under 7 `medium`, otherwise `high`. The backend and `lib/ai.ts` must agree on the weights.

| Endpoint                          | Notes                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ai/assessments`             | Default sort `-ref`. Filters: `status`, `decision` (`none` for undecided), `useCaseId`, `risk` (final, or suggested while open).                                                                                                                                                                                                                                                       |
| `POST /ai/assessments`            | `{ useCaseId }` ("Run assessment") → 201 with a blank question set. 422 if one is already `in_progress` for that use case, or the use case is retired.                                                                                                                                                                                                                                 |
| `GET /ai/assessments/:id`         |                                                                                                                                                                                                                                                                                                                                                                                        |
| `PATCH /ai/assessments/:id`       | `{ ifVersion, questions?: [{ id, answer, note }], humanOversight?, oversightNote? }`. 422 once decided.                                                                                                                                                                                                                                                                                |
| `POST /ai/assessments/:id/decide` | `{ ifVersion, decision, riskLevel, humanOversight, oversightNote, conditions }`. 422 while any question is unanswered; 400 on `conditions` (at least 10 characters) for `approved_with_conditions`. Sets the assessment `decided`, the use case's `riskLevel`, and its `status` (`approved` for both approvals, `rejected`). Audit `ai_assessment.decided` and `ai_use_case.assessed`. |
| `DELETE /ai/assessments/:id`      | 204. Only while `in_progress` (422 otherwise: a decided assessment is a record).                                                                                                                                                                                                                                                                                                       |

### Policy profiles

`AiProfile`: `key` (`law_firm | clinic | govtech | custom`), `name`, `description`, `piiRecognizers[]`, `guardrails[]`, `blockedTopics[]`, `enabled`. Recognizer IDs: `PERSON_NAME`, `EMAIL`, `PH_PHONE`, `PH_TIN`, `PH_SSS`, `PH_PHILSYS`, `PH_PHILHEALTH`, `CREDIT_CARD`, `IP_ADDRESS`. Guardrail IDs: `prompt_injection`, `secrets`, `bulk_export`, `output_pii`. There are four profiles per organisation and several may be enabled.

| Endpoint                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ai/profiles`           | All four, in the order above.                                                                                                                                                                                                                                                                                                                                                                                        |
| `GET /ai/profiles/:id`       | The ID or the key.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `PATCH /ai/profiles/:id`     | `{ ifVersion, piiRecognizers, guardrails, blockedTopics, enabled }`. 400 on an unknown recognizer or guardrail ID; topics are 2–80 characters, at most 30, and de-duplicated without regard to case. Audit `ai_profile.updated`.                                                                                                                                                                                     |
| `POST /ai/profiles/:id/test` | `ai.read`. `{ prompt, config?: { piiRecognizers, guardrails, blockedTopics } }` → `AiPromptTestResult` `{ action: "masked" \| "blocked" \| "allowed", masked, findings: [{ type, label, count }], reasons[] }`. `config` tries settings that aren't saved. **Nothing is stored or logged.** `masked` is the prompt with matches replaced (`[PH_TIN]`). The mock is a stand-in: the real endpoint is the proxy's own. |

### Provider keys

`AiProviderKey`: `provider` (`openai | anthropic | azure_openai | google | other`), `label`, `storage` (`fernet | azure_key_vault | byok`), `last4`, `reference` (BYOK only), `rotatedAt`. **There is no field that holds a key, and no endpoint returns one.**

| Endpoint                   | Notes                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /ai/keys`             | Default sort `label`. Filters: `provider`, `storage`.                                                                                                                                                                                                                                                                                          |
| `POST /ai/keys`            | `{ provider, label, storage, key }` for `fernet` and `azure_key_vault` (at least 20 characters; `last4` is taken from it). For `byok`: `{ …, reference, last4 }` and **no `key`** (400 on `key`: the key never reaches LoopDox). → 201 `AiProviderKey`. The key is never echoed, logged, written to the audit log, or put in an error message. |
| `POST /ai/keys/:id/rotate` | `{ key }`, or `{ reference, last4 }` for BYOK. Sets `last4` and `rotatedAt`. Audit `ai_key.rotated` with the last four only.                                                                                                                                                                                                                   |
| `DELETE /ai/keys/:id`      | 204. Audit `ai_key.deleted` with the last four only.                                                                                                                                                                                                                                                                                           |

### Statistics and events

`GET /ai/stats?from=&to=` → `AiStats`: `{ from, to, status: "healthy" | "degraded", statusNote, latencyP95Ms, uptimePct, checkedAt, days: AiStatsDay[], totals, previous, topBlocked: [{ reason, count }] }`. Defaults to the last 30 days; at most 90 days at a time (400 otherwise; so is `from` after `to`). `AiStatsDay`: `date`, `calls`, `piiMasked`, `blocked`, `cacheHits`, `costEstimatePhp`. `previous` is the period of the same length just before, or `null` when it isn't on record. `topBlocked` is the five biggest reasons in the window. The cache hit rate is `cacheHits / calls`.

`GET /ai/events`: `AiEvent` `{ id, at, app, userId, userName, action: "masked" | "blocked" | "allowed", profile, model, entities: [{ type, count }], reason, maskedSample }`. Default sort `-at`. Filters: `action`, `app`, `profile`, `user` (a user ID, or `service` for a service account), `from`, `to` (calendar dates in the org's timezone). `q` searches app, user, reason, sample and profile. `GET /ai/events/facets` → `{ apps, profiles, users: [{ id, name }] }` for the filter menus.

**Backend must enforce: `maskedSample` is what the proxy forwarded, with every match already replaced. A raw prompt never reaches LoopDox**, in events, statistics, the audit log or search.

### Dashboard (M8)

`GET /overview` gains `ai`: `{ status, calls, piiMasked, blocked, series: number[] }` (the last 30 days, `series` = daily calls oldest first), or `null` without the plan or `ai.read`. VisorShield-only tenants get `documents: null`, `controlCoverage: null` and this tile.

### Audit actions (M8)

`ai_use_case.created|updated|retired|reopened|deleted|assessed`, `ai_assessment.started|decided|cancelled`, `ai_profile.updated`, `ai_key.created|rotated|deleted`.

## Test-only endpoints (mock mode)

Available only when `API_MODE=mock` and `MOCK_ALLOW_RESET=1` (the Playwright config sets both); otherwise 404. Not part of the FastAPI contract.

| Endpoint                  | Body                                        | Effect                                                  |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| `POST /api/mock/reset`    | –                                           | Reseeds the store                                       |
| `POST /api/mock/usage`    | `{ org, askQuestions }`                     | Sets this month's Ask question count                    |
| `POST /api/mock/ai-proxy` | `{ org, status }` (`healthy` or `degraded`) | Sets the VisorShield proxy status the statistics report |
