import { z } from 'zod'
import { recordTypeSchema } from '@/lib/schemas/privacy'

export const ASK_MAX_QUESTION = 1000

export const askRouteSchema = z.enum(['policy', 'records', 'impact'])

export const askRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(3, 'Type a question of at least a few words.')
    .max(ASK_MAX_QUESTION, `Keep questions under ${ASK_MAX_QUESTION} characters.`),
  threadId: z.string().nullish(),
  route: askRouteSchema.nullish(),
  asOf: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-14.')
    .nullish(),
  context: z.object({ type: recordTypeSchema, id: z.string().min(1) }).nullish(),
})
export type AskRequestInput = z.infer<typeof askRequestSchema>

export const askFeedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  note: z.string().trim().max(1000, 'Keep the note under 1,000 characters.').optional(),
})
