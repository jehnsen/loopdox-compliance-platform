import { z } from 'zod'

export const DOC_ID_PATTERN = /^[A-Z][A-Z0-9]{1,9}-\d{3,4}$/

export const docIdSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(DOC_ID_PATTERN, 'Use a prefix and number, like ITD-017.')

export const reviewCycleSchema = z.union([z.literal(6), z.literal(12), z.literal(24)])
export const classificationSchema = z.enum(['public', 'internal', 'confidential', 'restricted'])

const titleSchema = z.string().trim().min(3, 'Give the page a title.').max(160, 'Keep the title under 160 characters.')
const bodySchema = z.string().max(200_000, 'The page is too long (200,000 characters max).')
const changeSummarySchema = z
  .string()
  .trim()
  .min(3, 'Say what changed, in a few words.')
  .max(300, 'Keep the summary under 300 characters.')

/** The editor form. Also validates POST /documents. */
export const documentFormSchema = z.object({
  docId: docIdSchema,
  title: titleSchema,
  parentId: z.string().nullable(),
  owner: z.string().min(1, 'Choose an owner.'),
  reviewCycleMonths: reviewCycleSchema,
  requiresApproval: z.boolean(),
  classification: classificationSchema,
  bodyMarkdown: bodySchema,
  changeSummary: changeSummarySchema,
})
export type DocumentFormValues = z.infer<typeof documentFormSchema>

export const createDocumentSchema = documentFormSchema

export const updateDocumentSchema = z
  .object({
    ifVersion: z.number().int().positive(),
    docId: docIdSchema.optional(),
    title: titleSchema.optional(),
    parentId: z.string().nullable().optional(),
    owner: z.string().min(1).optional(),
    reviewCycleMonths: reviewCycleSchema.optional(),
    requiresApproval: z.boolean().optional(),
    classification: classificationSchema.optional(),
    bodyMarkdown: bodySchema.optional(),
    changeSummary: changeSummarySchema.optional(),
  })
  .refine((v) => (v.title === undefined && v.bodyMarkdown === undefined) || v.changeSummary, {
    path: ['changeSummary'],
    message: 'Say what changed, in a few words.',
  })

export const workflowNoteSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  ifVersion: z.number().int().positive().optional(),
})

export const rejectSchema = z.object({
  note: z.string().trim().min(3, 'Explain what needs to change.').max(2000),
  ifVersion: z.number().int().positive().optional(),
})

export const restoreSchema = z.object({
  version: z.number().int().positive(),
  ifVersion: z.number().int().positive(),
  changeSummary: z.string().trim().max(300).optional(),
})

export const reorderSchema = z.object({
  parentId: z.string().nullable(),
  orderedIds: z.array(z.string()).min(1),
})
