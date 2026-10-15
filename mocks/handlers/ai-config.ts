import type { AiKeyProvider, AiProfile, AiProviderKey } from '@/lib/api/types'
import { GUARDRAILS, KEY_PROVIDER_LABELS, RECOGNIZERS } from '@/lib/ai'
import {
  addKeySchema,
  keyMaterialIssues,
  rotateKeyBodySchema,
  testPromptSchema,
  updateProfileSchema,
} from '@/lib/schemas/ai'
import { audit } from '@/mocks/audit'
import { testPrompt } from '@/mocks/ai'
import { baseFields, touch } from '@/mocks/helpers'
import { checkVersion, HttpError, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const opts = { feature: 'aiGovernance' as const }

const orgProfiles = (ctx: OrgCtx) => ctx.db.aiProfiles.filter((p) => p.orgId === ctx.org.id)
const orgKeys = (ctx: OrgCtx) => ctx.db.aiKeys.filter((k) => k.orgId === ctx.org.id)

function findProfile(ctx: OrgCtx): AiProfile {
  const p = orgProfiles(ctx).find((x) => x.id === ctx.params.id || x.key === ctx.params.id)
  if (!p) throw notFound('Policy profile')
  return p
}

function findKey(ctx: OrgCtx): AiProviderKey {
  const k = orgKeys(ctx).find((x) => x.id === ctx.params.id)
  if (!k) throw notFound('Provider key')
  return k
}

/** Unknown recognizer or guardrail IDs are a client bug, so say which. */
function checkCatalogue(config: { piiRecognizers: string[]; guardrails: string[] }): void {
  const fields: Record<string, string> = {}
  const badRecognizer = config.piiRecognizers.find((r) => !RECOGNIZERS.some((d) => d.id === r))
  if (badRecognizer) fields.piiRecognizers = `“${badRecognizer}” isn’t a recognizer.`
  const badGuardrail = config.guardrails.find((g) => !GUARDRAILS.some((d) => d.id === g))
  if (badGuardrail) fields.guardrails = `“${badGuardrail}” isn’t a guardrail.`
  if (Object.keys(fields).length) {
    throw new HttpError(400, 'validation_error', 'Some fields need attention.', fields)
  }
}

const dedupeTopics = (topics: string[]) => {
  const seen = new Set<string>()
  return topics.filter((t) => {
    const k = t.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** What the API returns for a key. There is no field that could hold the key itself. */
function keyView(k: AiProviderKey): AiProviderKey {
  return {
    id: k.id,
    orgId: k.orgId,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    createdBy: k.createdBy,
    updatedBy: k.updatedBy,
    version: k.version,
    sample: k.sample,
    provider: k.provider,
    label: k.label,
    storage: k.storage,
    last4: k.last4,
    reference: k.reference,
    rotatedAt: k.rotatedAt,
  }
}

const keyLabel = (k: AiProviderKey) => `${KEY_PROVIDER_LABELS[k.provider]}: ${k.label}`

export const aiConfigRoutes: RouteDef[] = [
  // -------------------------------------------------------------------------
  // Policy profiles
  // -------------------------------------------------------------------------
  orgRoute('GET', '/ai/profiles', { ...opts, permission: 'ai.read' }, (ctx) =>
    json({ items: orgProfiles(ctx), total: orgProfiles(ctx).length, page: 1, pageSize: 50 }),
  ),

  orgRoute('GET', '/ai/profiles/:id', { ...opts, permission: 'ai.read' }, (ctx) =>
    json(findProfile(ctx)),
  ),

  orgRoute('PATCH', '/ai/profiles/:id', { ...opts, permission: 'ai.edit' }, async (ctx) => {
    const { ifVersion, ...config } = parse(updateProfileSchema, await ctx.json())
    const p = findProfile(ctx)
    checkVersion(p, ifVersion)
    checkCatalogue(config)
    const before = JSON.stringify([p.piiRecognizers, p.guardrails, p.blockedTopics, p.enabled])
    p.piiRecognizers = config.piiRecognizers
    p.guardrails = config.guardrails
    p.blockedTopics = dedupeTopics(config.blockedTopics)
    p.enabled = config.enabled
    touch(ctx, p)
    audit(
      ctx,
      'ai_profile.updated',
      { type: 'ai_profile', id: p.id, label: `${p.name} profile` },
      {
        changed:
          before !== JSON.stringify([p.piiRecognizers, p.guardrails, p.blockedTopics, p.enabled]),
      },
    )
    commit()
    return json(p)
  }),

  /**
   * "Test a prompt". A stand-in for the proxy's test endpoint: it says what would be
   * masked or blocked. Nothing is stored or logged, and the response carries the masked
   * prompt only. `config` tries settings that haven't been saved.
   */
  orgRoute('POST', '/ai/profiles/:id/test', { ...opts, permission: 'ai.read' }, async (ctx) => {
    const body = parse(testPromptSchema, await ctx.json())
    const p = findProfile(ctx)
    const config = body.config ?? {
      piiRecognizers: p.piiRecognizers,
      guardrails: p.guardrails,
      blockedTopics: p.blockedTopics,
    }
    checkCatalogue(config)
    return json(testPrompt(body.prompt, config))
  }),

  // -------------------------------------------------------------------------
  // Provider keys: the key is accepted once and never returned
  // -------------------------------------------------------------------------
  orgRoute('GET', '/ai/keys', { ...opts, permission: 'ai.read' }, (ctx) => {
    const items = orgKeys(ctx).map(keyView)
    return json(
      paginate(items, ctx.query, {
        search: (k) => [k.label, KEY_PROVIDER_LABELS[k.provider], k.last4],
        defaultSort: 'label',
        filters: {
          provider: (k, v) => v.includes(k.provider),
          storage: (k, v) => v.includes(k.storage),
        },
      }),
    )
  }),

  orgRoute('POST', '/ai/keys', { ...opts, permission: 'ai.edit' }, async (ctx) => {
    const input = parse(addKeySchema, await ctx.json())
    const at = ctx.now.toISOString()
    const k: AiProviderKey = {
      ...baseFields(ctx, 'aik'),
      provider: input.provider as AiKeyProvider,
      label: input.label,
      storage: input.storage,
      // The mock keeps the last four characters and nothing else.
      last4: input.storage === 'byok' ? (input.last4 ?? '') : (input.key ?? '').trim().slice(-4),
      reference: input.storage === 'byok' ? (input.reference ?? null) : null,
      rotatedAt: at,
    }
    ctx.db.aiKeys.push(k)
    audit(
      ctx,
      'ai_key.created',
      { type: 'ai_key', id: k.id, label: keyLabel(k) },
      { provider: k.provider, storage: k.storage, last4: k.last4 },
    )
    commit()
    return json(keyView(k), 201)
  }),

  // Replace a key with a new one. Same rule: the new key is sent once.
  orgRoute('POST', '/ai/keys/:id/rotate', { ...opts, permission: 'ai.edit' }, async (ctx) => {
    const body = parse(rotateKeyBodySchema, await ctx.json())
    const k = findKey(ctx)
    const issues = keyMaterialIssues(k.storage, body)
    if (issues.length) {
      throw new HttpError(
        400,
        'validation_error',
        'Some fields need attention.',
        Object.fromEntries(issues.map((i) => [i.path, i.message])),
      )
    }
    k.last4 = k.storage === 'byok' ? (body.last4 ?? '') : (body.key ?? '').trim().slice(-4)
    if (k.storage === 'byok') k.reference = body.reference ?? k.reference
    k.rotatedAt = ctx.now.toISOString()
    touch(ctx, k)
    audit(
      ctx,
      'ai_key.rotated',
      { type: 'ai_key', id: k.id, label: keyLabel(k) },
      { last4: k.last4 },
    )
    commit()
    return json(keyView(k))
  }),

  orgRoute('DELETE', '/ai/keys/:id', { ...opts, permission: 'ai.edit' }, (ctx) => {
    const k = findKey(ctx)
    ctx.db.aiKeys = ctx.db.aiKeys.filter((x) => x.id !== k.id)
    audit(
      ctx,
      'ai_key.deleted',
      { type: 'ai_key', id: k.id, label: keyLabel(k) },
      { last4: k.last4 },
    )
    commit()
    return noContent()
  }),
]
