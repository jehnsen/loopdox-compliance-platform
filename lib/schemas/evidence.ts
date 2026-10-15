import { z } from 'zod'
import { ACCOUNT_MAX } from '@/lib/evidence'

/** Evidence module schemas: shared by the forms and the mock API. */

const isoDate = z.iso.date({ error: 'Enter a date.' })

export const evidenceResultSchema = z.enum(['pass', 'fail', 'info'])

/** The text fields sent beside the file in POST /evidence. */
export const uploadEvidenceSchema = z.object({
  controlId: z.string().min(1, 'Choose a control.'),
  summary: z
    .string()
    .trim()
    .min(10, 'Say what this evidence shows, in at least 10 characters.')
    .max(500, 'Keep it under 500 characters.'),
  result: evidenceResultSchema,
  collectedOn: isoDate.optional(),
})
export type UploadEvidenceValues = z.infer<typeof uploadEvidenceSchema>

/** Words that mean someone is trying to hand LoopDox a credential (D117 applies here too). */
export const CREDENTIAL_FIELDS = [
  'value',
  'secret',
  'password',
  'token',
  'apiKey',
  'key',
  'clientSecret',
] as const

export const connectorFormSchema = z.object({
  account: z.string().trim().min(2, 'Enter the account to connect.').max(ACCOUNT_MAX),
})
export type ConnectorFormValues = z.infer<typeof connectorFormSchema>

export const updateConnectorSchema = z.object({
  ifVersion: z.number().int().positive(),
  status: z.enum(['connected', 'disconnected']),
  account: z.string().trim().min(2, 'Enter the account to connect.').max(ACCOUNT_MAX).optional(),
})
