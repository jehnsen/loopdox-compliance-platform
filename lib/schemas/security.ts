import { z } from 'zod'
import { scoreSchema } from '@/lib/schemas/privacy'

/** Security module schemas: shared by the forms and the mock API. */

const isoDate = z.iso.date({ error: 'Enter a date.' })
const isoDateTime = z.iso.datetime({ error: 'Enter a date and time.' })
const id = z.string().min(1)
const ifVersion = z.number().int().positive()

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------

export const systemTypeSchema = z.enum([
  'server',
  'cloud_account',
  'repository',
  'domain',
  'saas',
  'database',
  'other',
])
export const classificationSchema = z.enum(['public', 'internal', 'confidential', 'restricted'])

export const systemFormSchema = z.object({
  name: z.string().trim().min(2, 'Name the system.').max(120),
  type: systemTypeSchema,
  provider: z.string().trim().min(1, 'Enter the provider, or “On-premises”.').max(120),
  owner: z.string().min(1, 'Choose an owner.'),
  classification: classificationSchema,
  hosting: z.string().trim().max(160),
  holdsPersonalData: z.boolean(),
  notes: z.string().trim().max(4000),
})
export type SystemFormValues = z.infer<typeof systemFormSchema>
export const updateSystemSchema = systemFormSchema.safeExtend({ ifVersion })

// ---------------------------------------------------------------------------
// Access grants and reviews
// ---------------------------------------------------------------------------

export const accessLevelSchema = z.enum(['owner', 'admin', 'write', 'read'])

export const grantFormSchema = z
  .object({
    systemId: z.string().min(1, 'Choose a system.'),
    userId: z.string().nullable(),
    externalName: z.string().trim().max(120).nullable(),
    level: accessLevelSchema,
    approvedBy: z.string().min(1, 'Choose who approved it.'),
    grantedAt: isoDate,
    notes: z.string().trim().max(2000),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.externalName), {
    path: ['userId'],
    message: 'Choose a member, or name someone outside the organisation.',
  })
export type GrantFormValues = z.infer<typeof grantFormSchema>
export const updateGrantSchema = grantFormSchema.safeExtend({ ifVersion })

export const reviewPeriodSchema = z.string().regex(/^\d{4}-Q[1-4]$/, 'Use the form 2026-Q4.')

export const createAccessReviewSchema = z.object({
  period: reviewPeriodSchema,
  systemIds: z.array(id).min(1, 'Choose at least one system.'),
  reviewer: z.string().min(1, 'Choose a reviewer.'),
})
export type CreateAccessReviewValues = z.infer<typeof createAccessReviewSchema>

export const reviewDecisionSchema = z
  .object({
    ifVersion,
    decision: z.enum(['keep', 'revoke', 'change']).nullable(),
    note: z.string().trim().max(1000).optional(),
    newLevel: accessLevelSchema.nullable().optional(),
  })
  .refine((v) => v.decision !== 'change' || Boolean(v.newLevel), {
    path: ['newLevel'],
    message: 'Choose the level this person should have.',
  })
  .refine((v) => v.decision !== 'revoke' || Boolean(v.note?.trim()), {
    path: ['note'],
    message: 'Say why access is being removed.',
  })

export const bulkKeepSchema = z.object({ ifVersion, grantIds: z.array(id).optional() })
export const versionOnlySchema = z.object({ ifVersion })

// ---------------------------------------------------------------------------
// Secrets
// ---------------------------------------------------------------------------

export const secretFormSchema = z.object({
  name: z.string().trim().min(2, 'Name the secret (not its value).').max(120),
  location: z.string().trim().min(2, 'Say where it is stored.').max(200),
  systemId: z.string().nullable(),
  owner: z.string().min(1, 'Choose an owner.'),
  lastRotatedAt: isoDate,
  rotationDays: z
    .number({ error: 'Enter a number of days.' })
    .int('Use whole days.')
    .min(1, 'At least 1 day.')
    .max(730, 'At most 730 days.'),
  notes: z.string().trim().max(2000),
})
export type SecretFormValues = z.infer<typeof secretFormSchema>
export const updateSecretSchema = secretFormSchema.safeExtend({ ifVersion })

/** Field names that would carry a secret's value. The API refuses them. */
export const SECRET_VALUE_FIELDS = [
  'value',
  'secret',
  'password',
  'token',
  'apiKey',
  'key',
] as const

export const markRotatedSchema = z.object({ ifVersion, rotatedAt: isoDate.optional() })

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

export const changeSourceSchema = z.enum(['github_pr', 'deploy', 'manual'])

export const changeFormSchema = z
  .object({
    source: changeSourceSchema,
    externalUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => !v || /^https?:\/\//i.test(v), 'Use a link starting with https://')
      .nullable(),
    systemId: z.string().min(1, 'Choose a system.'),
    summary: z.string().trim().min(5, 'Say what changed.').max(500),
    approver: z.string().nullable(),
    deployedAt: isoDateTime,
    rollbackPlan: z.string().trim().min(3, 'Say how to roll it back.').max(1000),
    emergency: z.boolean(),
  })
  .refine((v) => v.emergency || Boolean(v.approver), {
    path: ['approver'],
    message: 'Choose who approved it. Only emergency changes can be approved afterwards.',
  })
export type ChangeFormValues = z.infer<typeof changeFormSchema>
export const updateChangeSchema = changeFormSchema.safeExtend({ ifVersion })

export const changeReviewSchema = z.object({
  ifVersion,
  note: z.string().trim().min(10, 'Write what was reviewed and what you found.').max(2000),
})

// ---------------------------------------------------------------------------
// Risks
// ---------------------------------------------------------------------------

export const riskTreatmentSchema = z.enum(['mitigate', 'accept', 'transfer', 'avoid'])

export const riskFormSchema = z
  .object({
    title: z.string().trim().min(3, 'Name the risk.').max(160),
    description: z.string().trim().max(4000),
    likelihood: scoreSchema,
    impact: scoreSchema,
    treatment: riskTreatmentSchema,
    residualLikelihood: scoreSchema.nullable(),
    residualImpact: scoreSchema.nullable(),
    owner: z.string().min(1, 'Choose an owner.'),
    reviewAt: isoDate,
    status: z.enum(['open', 'closed']),
    documentIds: z.array(id),
    controlIds: z.array(id),
  })
  .refine((v) => (v.residualLikelihood === null) === (v.residualImpact === null), {
    path: ['residualImpact'],
    message: 'Rate both residual likelihood and impact, or neither.',
  })
export type RiskFormValues = z.infer<typeof riskFormSchema>
export const updateRiskSchema = riskFormSchema.safeExtend({ ifVersion })

// ---------------------------------------------------------------------------
// Decisions (ADRs)
// ---------------------------------------------------------------------------

export const decisionFormSchema = z.object({
  title: z.string().trim().min(3, 'Name the decision.').max(160),
  context: z.string().trim().min(10, 'Describe the situation that forced a choice.').max(8000),
  decision: z.string().trim().min(5, 'State what was decided.').max(8000),
  consequences: z.string().trim().min(5, 'Say what follows from it.').max(8000),
  status: z.enum(['proposed', 'accepted']),
  decidedBy: z.string().min(1, 'Choose who decided.'),
  decidedAt: isoDate,
  systemIds: z.array(id),
})
export type DecisionFormValues = z.infer<typeof decisionFormSchema>
export const updateDecisionSchema = decisionFormSchema.safeExtend({ ifVersion })

/**
 * POST /risks takes the full register form, or just the short form a post-incident
 * review uses; everything else gets a sensible default.
 */
export const createRiskRequestSchema = z
  .object({
    title: z.string().trim().min(3, 'Name the risk.').max(160),
    description: z.string().trim().max(4000).default(''),
    likelihood: scoreSchema,
    impact: scoreSchema,
    treatment: riskTreatmentSchema.default('mitigate'),
    residualLikelihood: scoreSchema.nullable().default(null),
    residualImpact: scoreSchema.nullable().default(null),
    owner: z.string().min(1, 'Choose an owner.'),
    reviewAt: isoDate.optional(),
    status: z.enum(['open', 'closed']).default('open'),
    documentIds: z.array(id).default([]),
    controlIds: z.array(id).default([]),
    /** Links the new risk to this incident. */
    incidentId: z.string().optional(),
  })
  .refine((v) => (v.residualLikelihood === null) === (v.residualImpact === null), {
    path: ['residualImpact'],
    message: 'Rate both residual likelihood and impact, or neither.',
  })
