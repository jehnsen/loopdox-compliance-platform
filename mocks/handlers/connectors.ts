import type { Connector, ConnectorRunResult, Evidence } from '@/lib/api/types'
import { PROVIDER_ORDER, PROVIDERS } from '@/lib/evidence'
import { updateConnectorSchema } from '@/lib/schemas/evidence'
import { audit } from '@/mocks/audit'
import {
  evidenceItem,
  orgConnectors,
  rejectCredentials,
  refreshControlStatus,
} from '@/mocks/evidence'
import { baseFields, touch } from '@/mocks/helpers'
import { checkVersion, HttpError, json, notFound, paginate, parse } from '@/mocks/http'
import { usageFor } from '@/mocks/handlers/me'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { MOCK_CHECK_OUTCOMES, PASS_FALLBACK } from '@/mocks/seed/evidence'
import { commit } from '@/mocks/store'

const opts = { feature: 'evidence' as const }

function findConnector(ctx: OrgCtx): Connector {
  const c = orgConnectors(ctx).find((x) => x.id === ctx.params.id || x.provider === ctx.params.id)
  if (!c) throw notFound('Connector')
  return c
}

/** A run checks what the provider reports and records one evidence item per check. */
function run(ctx: OrgCtx, connector: Connector): ConnectorRunResult {
  const name = PROVIDERS[connector.provider].name
  if (connector.status === 'disconnected') {
    throw new HttpError(422, 'unprocessable', `${name} isn’t connected. Connect it, then run it.`)
  }
  const at = ctx.now.toISOString()
  connector.lastRunAt = at

  // A connector in error can't reach the provider, so nothing is collected and the error stands.
  if (connector.status === 'error' && connector.lastError) {
    connector.lastError = { ...connector.lastError, at }
    touch(ctx, connector)
    audit(
      ctx,
      'connector.run_failed',
      { type: 'connector', id: connector.id, label: name },
      { error: connector.lastError.message },
    )
    commit()
    return { connector, ok: false, evidence: [] }
  }

  const created: Evidence[] = []
  for (const check of connector.checks) {
    const outcome = MOCK_CHECK_OUTCOMES[check.id] ?? PASS_FALLBACK
    check.lastResult = outcome.result
    check.detail = outcome.detail
    check.checkedAt = at
    const evidence: Evidence = {
      ...baseFields(ctx, 'evd'),
      createdBy: 'system',
      updatedBy: 'system',
      controlId: check.controlId,
      source: 'connector',
      connectorId: connector.id,
      checkId: check.id,
      collectedAt: at,
      result: outcome.result,
      summary: `${name}: ${check.name}. ${outcome.detail}`,
      fileId: null,
      origin: null,
    }
    ctx.db.evidence.push(evidence)
    refreshControlStatus(ctx, check.controlId)
    created.push(evidence)
  }
  touch(ctx, connector)
  const failed = created.filter((e) => e.result === 'fail').length
  audit(
    ctx,
    'connector.run',
    { type: 'connector', id: connector.id, label: name },
    { checks: created.length, failed },
  )
  commit()
  return { connector, ok: true, evidence: created.map((e) => evidenceItem(ctx, e)) }
}

export const connectorRoutes: RouteDef[] = [
  orgRoute('GET', '/connectors', { ...opts, permission: 'evidence.read' }, (ctx) =>
    // The cards show GitHub, Azure, Google Workspace, then Hostinger.
    json(
      paginate(
        orgConnectors(ctx).sort(
          (a, b) => PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider),
        ),
        ctx.query,
      ),
    ),
  ),

  orgRoute('GET', '/connectors/:id', { ...opts, permission: 'evidence.read' }, (ctx) =>
    json(findConnector(ctx)),
  ),

  /**
   * Connect, reconfigure or disconnect. Mock mode simulates the provider's sign-in and
   * succeeds; the real flow redirects to the provider and LoopDox keeps only the grant.
   */
  orgRoute('PATCH', '/connectors/:id', { ...opts, permission: 'evidence.edit' }, async (ctx) => {
    const raw = await ctx.json()
    rejectCredentials(raw)
    const body = parse(updateConnectorSchema, raw)
    const connector = findConnector(ctx)
    checkVersion(connector, body.ifVersion)
    const name = PROVIDERS[connector.provider].name
    const at = ctx.now.toISOString()

    if (body.status === 'connected') {
      const account = body.account ?? connector.account
      if (!account) {
        throw new HttpError(400, 'validation_error', 'Enter the account to connect.', {
          account: 'Enter the account to connect.',
        })
      }
      // A new connection takes a plan slot; fixing or changing an existing one does not.
      if (connector.status === 'disconnected') {
        const { used, limit } = usageFor(ctx.db, ctx.org, ctx.now).connectors
        if (limit !== null && used >= limit) {
          throw new HttpError(
            403,
            'plan_limit_reached',
            `Your plan includes ${limit} ${limit === 1 ? 'connector' : 'connectors'} and ${limit === 1 ? 'it is' : 'all are'} in use. Disconnect one, or upgrade, to connect ${name}.`,
          )
        }
        connector.connectedAt = at
      }
      connector.status = 'connected'
      connector.account = account
      connector.lastError = null
      touch(ctx, connector)
      audit(
        ctx,
        'connector.connected',
        { type: 'connector', id: connector.id, label: name },
        { account },
      )
    } else {
      connector.status = 'disconnected'
      connector.account = null
      connector.connectedAt = null
      connector.lastError = null
      touch(ctx, connector)
      audit(ctx, 'connector.disconnected', { type: 'connector', id: connector.id, label: name })
    }
    commit()
    return json(connector)
  }),

  orgRoute('POST', '/connectors/:id/run', { ...opts, permission: 'evidence.edit' }, (ctx) =>
    json(run(ctx, findConnector(ctx))),
  ),
]
