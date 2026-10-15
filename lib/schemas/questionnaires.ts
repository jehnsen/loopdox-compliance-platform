import { z } from 'zod'

export const questionnaireUploadSchema = z.object({
  name: z.string().trim().min(3, 'Name the questionnaire.').max(160),
  client: z.string().trim().min(2, 'Who sent it? Enter the client’s name.').max(160),
})
export type QuestionnaireUploadInput = z.infer<typeof questionnaireUploadSchema>

export const questionnaireMappingSchema = z
  .object({
    ifVersion: z.number().int().positive(),
    questionColumn: z.number().int().min(0),
    answerColumn: z.number().int().min(0).nullable(),
  })
  .refine((v) => v.answerColumn === null || v.answerColumn !== v.questionColumn, {
    path: ['answerColumn'],
    message: 'Answers need a different column from the questions.',
  })

export const ANSWER_MAX = 5000

export const questionnaireRowSchema = z
  .object({
    ifVersion: z.number().int().positive(),
    draftAnswer: z.string().max(ANSWER_MAX, 'Keep answers under 5,000 characters.').optional(),
    status: z.enum(['draft', 'edited', 'approved', 'needs_input']).optional(),
  })
  .refine((v) => v.draftAnswer !== undefined || v.status !== undefined, {
    message: 'Send an answer or a status.',
  })
