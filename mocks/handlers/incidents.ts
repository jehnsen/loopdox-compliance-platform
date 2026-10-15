import type { IncidentReceipt, IncidentStatus, IncidentSummary } from '@/lib/api/types'
import { notificationDeadline } from '@/lib/countdown'
import { INCIDENT_STATUS_ORDER } from '@/lib/privacy'
import {
  noticesVersionSchema,
  recordNotificationSchema,
  reportIncidentSchema,
  updateIncidentSchema,
  updateNoticesSchema,
} from '@/lib/schemas/privacy'
import { formatDateTimeZone } from '@/lib/utils/dates'
import { audit } from '@/mocks/audit'
import { baseFields, membersWith, notify, touch, userName } from '@/mocks/helpers'
import { checkVersion, HttpError, json, notFound, paginate, parse } from '@/mocks/http'
import { draftNotices } from '@/mocks/notices'
import { canSeePrivacy, nextYearlyRef, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit, type MockIncident } from '@/mocks/store'

const opts = { feature: 'privacy' as const }

function orgIncidents(ctx: OrgCtx): MockIncident[] {
  return ctx.db.incidents.filter((i) => i.orgId === ctx.org.id)
}

function summarize(ctx: OrgCtx, i: MockIncident): IncidentSummary {
  return {
    ...i,
    notices: i.notices
      ? {
          ...i.notices,
          draftedByName: userName(ctx.db, i.notices.draftedBy),
          signedOffByName: i.notices.signedOffBy ? userName(ctx.db, i.notices.signedOffBy) : null,
        }
      : null,
    reportedByName: userName(ctx.db, i.reportedBy),
    updatedByName: userName(ctx.db, i.updatedBy),
  }
}

function findStored(ctx: OrgCtx, id: string): MockIncident {
  const i = orgIncidents(ctx).find((x) => x.id === id || x.ref === id.toUpperCase())
  if (!i || !canSeePrivacy(ctx, i.status === 'closed')) throw notFound('Incident')
  return i
}

function label(i: MockIncident): string {
  return `${i.ref} ${i.title}`
}

function target(i: MockIncident) {
  return { type: 'incident', id: i.id, label: label(i) }
}

function href(ctx: OrgCtx, i: MockIncident): string {
  return `/${ctx.org.slug}/privacy/incidents/${i.id}`
}

/** The clock runs from discovery whenever personal data is involved. */
function recomputeDeadline(i: MockIncident): void {
  i.notificationDeadline = i.personalDataInvolved ? notificationDeadline(i.discoveredAt) : null
}

function assertNotFuture(ctx: OrgCtx, iso: string, field: string, message: string): void {
  if (Date.parse(iso) > ctx.now.getTime() + 5 * 60_000) {
    throw new HttpError(400, 'validation_error', 'Some fields need attention.', {
      [field]: message,
    })
  }
}

const statusIndex = (s: IncidentStatus) => INCIDENT_STATUS_ORDER.indexOf(s)

const TRIAGE_FIELDS = [
  'severity',
  'personalDataInvolved',
  'affectedCount',
  'notificationRequired',
  'notificationRationale',
] as const

export const incidentRoutes: RouteDef[] = [
  orgRoute('GET', '/incidents', { ...opts, permission: 'privacy.read' }, (ctx) => {
    const items = orgIncidents(ctx)
      .filter((i) => canSeePrivacy(ctx, i.status === 'closed'))
      .map((i) => summarize(ctx, i))
    return json(
      paginate(items, ctx.query, {
        search: (i) => [i.ref, i.title, i.description],
        defaultSort: '-discoveredAt',
        filters: {
          status: (i, v) => v.includes(i.status),
          severity: (i, v) => v.includes(i.severity ?? 'none'),
          personalData: (i, v) => v.includes(String(i.personalDataInvolved)),
          open: (i, v) => (v[0] === 'true' ? i.status !== 'closed' : true),
        },
      }),
    )
  }),

  // Anyone who can report may: staff included. They get a receipt, not the record.
  orgRoute('POST', '/incidents', { ...opts, permission: 'incidents.report' }, async (ctx) => {
    const input = parse(reportIncidentSchema, await ctx.json())
    assertNotFuture(
      ctx,
      input.discoveredAt,
      'discoveredAt',
      'The discovery time can’t be in the future.',
    )
    const i: MockIncident = {
      ...baseFields(ctx, 'inc'),
      ref: nextYearlyRef(
        ctx,
        orgIncidents(ctx).map((x) => x.ref),
        'INC',
      ),
      title: input.title,
      description: input.description,
      discoveredAt: new Date(input.discoveredAt).toISOString(),
      reportedBy: ctx.user.id,
      affectedSummary: input.affectedSummary,
      severity: null,
      personalDataInvolved: input.personalDataInvolved,
      affectedCount: null,
      processingActivityIds: [],
      systemIds: [],
      documentIds: [],
      riskIds: [],
      notificationRequired: null,
      notificationRationale: null,
      notificationDeadline: null,
      npcNotifiedAt: null,
      npcReference: null,
      subjectsNotifiedAt: null,
      containedAt: null,
      closedAt: null,
      status: 'reported',
      postIncidentReview: null,
      notices: null,
    }
    recomputeDeadline(i)
    ctx.db.incidents.push(i)
    audit(ctx, 'incident.reported', target(i), { personalDataInvolved: i.personalDataInvolved })
    notify(
      ctx,
      membersWith(ctx, 'privacy.edit'),
      'deadline_breach',
      `${i.ref} reported: ${i.title}`,
      i.notificationDeadline
        ? `Personal data may be involved. NPC notification is due by ${formatDateTimeZone(i.notificationDeadline, ctx.org.timezone)}.`
        : `Reported by ${ctx.user.name}. No personal data reported.`,
      href(ctx, i),
    )
    commit()
    const receipt: IncidentReceipt = {
      id: i.id,
      ref: i.ref,
      title: i.title,
      notificationDeadline: i.notificationDeadline,
      createdAt: i.createdAt,
    }
    return json(receipt, 201)
  }),

  orgRoute('GET', '/incidents/:id', { ...opts, permission: 'privacy.read' }, (ctx) =>
    json(summarize(ctx, findStored(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/incidents/:id', { ...opts, permission: 'privacy.edit' }, async (ctx) => {
    const { ifVersion, status, ...input } = parse(updateIncidentSchema, await ctx.json())
    const i = findStored(ctx, ctx.params.id ?? '')
    checkVersion(i, ifVersion)

    const changed = Object.entries(input).filter(([, v]) => v !== undefined)
    if (
      i.status === 'closed' &&
      (status !== undefined || changed.some(([k]) => k !== 'postIncidentReview'))
    ) {
      throw unprocessable('Closed incidents can’t be changed, except for the post-incident review.')
    }
    if (input.discoveredAt) {
      assertNotFuture(
        ctx,
        input.discoveredAt,
        'discoveredAt',
        'The discovery time can’t be in the future.',
      )
    }

    if (input.title !== undefined) i.title = input.title
    if (input.description !== undefined) i.description = input.description
    if (input.affectedSummary !== undefined) i.affectedSummary = input.affectedSummary
    if (input.discoveredAt !== undefined)
      i.discoveredAt = new Date(input.discoveredAt).toISOString()
    if (input.severity !== undefined) i.severity = input.severity
    if (input.personalDataInvolved !== undefined)
      i.personalDataInvolved = input.personalDataInvolved
    if (input.affectedCount !== undefined) i.affectedCount = input.affectedCount
    if (input.notificationRequired !== undefined)
      i.notificationRequired = input.notificationRequired
    if (input.notificationRationale !== undefined)
      i.notificationRationale = input.notificationRationale || null
    if (input.postIncidentReview !== undefined)
      i.postIncidentReview = input.postIncidentReview || null
    recomputeDeadline(i)

    const triaged = changed.some(([k]) => (TRIAGE_FIELDS as readonly string[]).includes(k))
    if (triaged && i.status === 'reported') i.status = 'triage'

    if (status !== undefined && status !== i.status) {
      if (statusIndex(status) < statusIndex(i.status)) {
        throw unprocessable('An incident can’t move back to an earlier stage.')
      }
      if (status === 'closed') {
        if (i.personalDataInvolved && i.notificationRequired === null) {
          throw unprocessable('Decide whether notification is required before closing.')
        }
        if (i.notificationRequired && !i.npcNotifiedAt) {
          throw unprocessable('Record the NPC notification before closing.')
        }
        i.closedAt = ctx.now.toISOString()
      }
      if (status === 'contained' || status === 'closed') i.containedAt ??= ctx.now.toISOString()
      i.status = status
    }

    touch(ctx, i)
    const action =
      status === 'closed' || status === 'contained'
        ? `incident.${status}`
        : triaged
          ? 'incident.triaged'
          : 'incident.updated'
    audit(ctx, action, target(i), {
      ...(input.notificationRequired !== undefined
        ? { notificationRequired: input.notificationRequired }
        : {}),
      ...(input.severity ? { severity: input.severity } : {}),
    })
    commit()
    return json(summarize(ctx, i))
  }),

  orgRoute(
    'POST',
    '/incidents/:id/notices/draft',
    { ...opts, permission: 'privacy.edit' },
    async (ctx) => {
      const { ifVersion } = parse(noticesVersionSchema, await ctx.json())
      const i = findStored(ctx, ctx.params.id ?? '')
      checkVersion(i, ifVersion)
      if (!i.personalDataInvolved)
        throw unprocessable('Notices are only needed when personal data is involved.')
      if (i.notificationRequired === false) {
        throw unprocessable('Triage recorded that notification isn’t required.')
      }
      if (i.npcNotifiedAt) throw unprocessable('The NPC has already been notified.')
      i.notices = {
        ...draftNotices({ db: ctx.db, org: ctx.org, incident: i }),
        draftedAt: ctx.now.toISOString(),
        draftedBy: ctx.user.id,
        signedOffBy: null,
        signedOffAt: null,
      }
      touch(ctx, i)
      audit(ctx, 'incident.notices_drafted', target(i))
      notify(
        ctx,
        membersWith(ctx, 'incidents.sign_off'),
        'approval_requested',
        `${i.ref}: breach notices are ready for your sign-off`,
        `${ctx.user.name} drafted the NPC and data subject notices.`,
        href(ctx, i),
      )
      commit()
      return json(summarize(ctx, i))
    },
  ),

  orgRoute(
    'PATCH',
    '/incidents/:id/notices',
    { ...opts, permission: 'privacy.edit' },
    async (ctx) => {
      const input = parse(updateNoticesSchema, await ctx.json())
      const i = findStored(ctx, ctx.params.id ?? '')
      checkVersion(i, input.ifVersion)
      if (!i.notices) throw unprocessable('Draft the notices first.')
      if (i.npcNotifiedAt)
        throw unprocessable('The NPC has already been notified; the notices are final.')
      const wasSigned = Boolean(i.notices.signedOffAt)
      if (input.npc) i.notices.npc = input.npc
      if (input.subjects) i.notices.subjects = input.subjects
      // Edited text needs a fresh sign-off.
      i.notices.signedOffBy = null
      i.notices.signedOffAt = null
      touch(ctx, i)
      audit(ctx, 'incident.notices_edited', target(i), wasSigned ? { signOffCleared: true } : {})
      commit()
      return json(summarize(ctx, i))
    },
  ),

  orgRoute(
    'POST',
    '/incidents/:id/notices/sign-off',
    { ...opts, permission: 'incidents.sign_off' },
    async (ctx) => {
      const { ifVersion } = parse(noticesVersionSchema, await ctx.json())
      const i = findStored(ctx, ctx.params.id ?? '')
      checkVersion(i, ifVersion)
      if (!i.notices) throw unprocessable('There are no notices to sign off yet.')
      if (i.notices.signedOffAt) throw unprocessable('These notices are already signed off.')
      if (i.notificationRequired !== true) {
        throw unprocessable('Triage must record that notification is required before sign-off.')
      }
      i.notices.signedOffBy = ctx.user.id
      i.notices.signedOffAt = ctx.now.toISOString()
      touch(ctx, i)
      audit(ctx, 'incident.notices_signed_off', target(i))
      notify(
        ctx,
        membersWith(ctx, 'privacy.edit'),
        'approval_decided',
        `${i.ref}: notices signed off`,
        `${ctx.user.name} signed off the breach notices. Send them and record when.`,
        href(ctx, i),
      )
      commit()
      return json(summarize(ctx, i))
    },
  ),

  orgRoute(
    'POST',
    '/incidents/:id/notifications',
    { ...opts, permission: 'privacy.edit' },
    async (ctx) => {
      const input = parse(recordNotificationSchema, await ctx.json())
      const i = findStored(ctx, ctx.params.id ?? '')
      checkVersion(i, input.ifVersion)
      if (!i.notices?.signedOffAt)
        throw unprocessable('An approver must sign off the notices first.')
      assertNotFuture(ctx, input.at, 'at', 'This can’t be in the future.')
      if (Date.parse(input.at) < Date.parse(i.discoveredAt)) {
        throw new HttpError(400, 'validation_error', 'Some fields need attention.', {
          at: 'This can’t be before the incident was discovered.',
        })
      }
      const at = new Date(input.at).toISOString()
      if (input.kind === 'npc') {
        if (i.npcNotifiedAt) throw unprocessable('The NPC notification is already recorded.')
        i.npcNotifiedAt = at
        i.npcReference = input.reference || null
        if (i.status !== 'closed') i.status = 'notified'
      } else {
        if (i.subjectsNotifiedAt)
          throw unprocessable('The data subject notification is already recorded.')
        i.subjectsNotifiedAt = at
      }
      touch(ctx, i)
      audit(
        ctx,
        input.kind === 'npc' ? 'incident.npc_notified' : 'incident.subjects_notified',
        target(i),
        {
          at,
          ...(input.reference ? { reference: input.reference } : {}),
          ...(input.kind === 'npc' && i.notificationDeadline
            ? { late: Date.parse(at) > Date.parse(i.notificationDeadline) }
            : {}),
        },
      )
      commit()
      return json(summarize(ctx, i))
    },
  ),
]
