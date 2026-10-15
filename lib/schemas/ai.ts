import { z } from 'zod'
import {
  ASSESSMENT_QUESTIONS,
  KEY_MIN_LENGTH,
  MAX_BLOCKED_TOPICS,
  TEST_PROMPT_MAX,
  TOPIC_MAX_LENGTH,
} from '@/lib/ai'

/** AI Governance schemas: shared by the forms and the mock API. */

const ifVersion = z.number().int().positive()

export const riskLevelSchema = z.enum(['low', 'medium', 'high'])
export const useCaseStatusSchema = z.enum(['proposed', 'approved', 'rejected', 'retired'])

export const useCaseFormSchema = z.object({
  name: z.string().trim().min(3, 'Name the use case.').max(120),
  tool: z.string().trim().min(2, 'Name the tool or app.').max(120),
  provider: z.string().trim().min(2, 'Name the provider.').max(120),
  model: z.string().trim().min(2, 'Name the model, or the family if it changes.').max(120),
  purpose: z
    .string()
    .trim()
    .min(10, 'Say what it is used for, in at least 10 characters.')
    .max(1000),
  dataCategories: z.array(z.string().trim().min(1).max(80)).max(30),
  riskLevel: riskLevelSchema,
  owner: z.string().min(1, 'Choose an owner.'),
  notes: z.string().trim().max(4000),
})
export type UseCaseFormValues = z.infer<typeof useCaseFormSchema>

export const updateUseCaseSchema = useCaseFormSchema.safeExtend({
  ifVersion,
  status: useCaseStatusSchema.optional(),
})

const answerSchema = z.enum(['yes', 'no', 'unsure'])

export const updateAssessmentSchema = z.object({
  ifVersion,
  questions: z
    .array(
      z.object({
        id: z.enum(ASSESSMENT_QUESTIONS.map((q) => q.id) as [string, ...string[]]),
        answer: answerSchema.nullable(),
        note: z.string().trim().max(500),
      }),
    )
    .optional(),
  humanOversight: z.boolean().nullable().optional(),
  oversightNote: z.string().trim().max(1000).optional(),
})

export const decideAssessmentSchema = z
  .object({
    ifVersion,
    decision: z.enum(['approved', 'approved_with_conditions', 'rejected']),
    riskLevel: riskLevelSchema,
    humanOversight: z.boolean(),
    oversightNote: z.string().trim().max(1000),
    conditions: z.string().trim().max(2000),
  })
  .refine((v) => v.decision !== 'approved_with_conditions' || v.conditions.length >= 10, {
    path: ['conditions'],
    message: 'State the conditions, in at least 10 characters.',
  })
export type DecideAssessmentValues = z.infer<typeof decideAssessmentSchema>

const topic = z.string().trim().min(2, 'A topic needs at least 2 characters.').max(TOPIC_MAX_LENGTH)

export const profileConfigSchema = z.object({
  piiRecognizers: z.array(z.string().min(1)).max(50),
  guardrails: z.array(z.string().min(1)).max(50),
  blockedTopics: z.array(topic).max(MAX_BLOCKED_TOPICS),
})

export const updateProfileSchema = profileConfigSchema.safeExtend({
  ifVersion,
  enabled: z.boolean(),
})

export const testPromptSchema = z.object({
  prompt: z.string().min(1, 'Type a prompt to test.').max(TEST_PROMPT_MAX),
  config: profileConfigSchema.optional(),
})

export const keyProviderSchema = z.enum(['openai', 'anthropic', 'azure_openai', 'google', 'other'])
export const keyStorageSchema = z.enum(['fernet', 'azure_key_vault', 'byok'])

export interface KeyMaterial {
  key?: string
  reference?: string
  last4?: string
}

/**
 * What a key's storage type needs: fernet and Key Vault take the key itself, once; a
 * bring-your-own key takes only where it is kept and its last four characters.
 */
export function keyMaterialIssues(
  storage: 'fernet' | 'azure_key_vault' | 'byok',
  v: KeyMaterial,
): { path: 'key' | 'reference' | 'last4'; message: string }[] {
  const issues: { path: 'key' | 'reference' | 'last4'; message: string }[] = []
  if (storage === 'byok') {
    if (!v.reference || v.reference.length < 5) {
      issues.push({ path: 'reference', message: 'Enter where the key is kept.' })
    }
    if (!/^[A-Za-z0-9_-]{4}$/.test(v.last4 ?? '')) {
      issues.push({ path: 'last4', message: 'Enter the last 4 characters of the key.' })
    }
    if (v.key) {
      issues.push({
        path: 'key',
        message: 'A bring-your-own key is never sent to LoopDox. Remove it.',
      })
    }
  } else {
    if (!v.key || v.key.trim().length < KEY_MIN_LENGTH) {
      issues.push({
        path: 'key',
        message: `Paste the whole key (at least ${KEY_MIN_LENGTH} characters).`,
      })
    }
    if (v.reference || v.last4) {
      issues.push({ path: 'reference', message: 'Only a bring-your-own key takes a reference.' })
    }
  }
  return issues
}

const keyMaterialFields = {
  key: z.string().max(500).optional(),
  reference: z.string().trim().max(300).optional(),
  last4: z.string().trim().max(4).optional(),
}

export const addKeySchema = z
  .object({
    provider: keyProviderSchema,
    label: z.string().trim().min(2, 'Give the key a label.').max(80),
    storage: keyStorageSchema,
    ...keyMaterialFields,
  })
  .superRefine((v, ctx) => {
    for (const issue of keyMaterialIssues(v.storage, v))
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message })
  })
export type AddKeyValues = z.infer<typeof addKeySchema>

/** Rotate: the storage type is the key's own, so the body is only the new material. */
export const rotateKeyBodySchema = z.object(keyMaterialFields)
