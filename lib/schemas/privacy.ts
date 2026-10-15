import { z } from 'zod'

/** Privacy module schemas: shared by the forms and the mock API. */

const isoDate = z.iso.date({ error: 'Enter a date.' })
const isoDateTime = z.iso.datetime({ error: 'Enter a date and time.' })
const id = z.string().min(1)
const ifVersion = z.number().int().positive()

export const scoreSchema = z.literal([1, 2, 3, 4, 5], { error: 'Choose 1 to 5.' })
export const severitySchema = z.enum(['low', 'medium', 'high', 'critical'])

/** Five minutes of slack for clock drift between the browser and the server. */
const notInFuture = (iso: string) => Date.parse(iso) <= Date.now() + 5 * 60_000

// ---------------------------------------------------------------------------
// Processing records
// ---------------------------------------------------------------------------

export const legalBasisSchema = z.enum([
  'consent',
  'contract',
  'legal_obligation',
  'vital_interests',
  'public_authority',
  'legitimate_interests',
])
export const processingStatusSchema = z.enum(['draft', 'approved', 'retired'])

export const dataCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name the category.').max(80),
  sensitive: z.boolean(),
})

export const recipientSchema = z.object({
  name: z.string().trim().min(1, 'Name the recipient.').max(120),
  kind: z.enum(['internal', 'third_party', 'authority']),
})

export const processingFormSchema = z
  .object({
    name: z.string().trim().min(3, 'Name the activity.').max(160),
    purpose: z.string().trim().min(3, 'Say why the data is processed.').max(2000),
    legalBasis: legalBasisSchema,
    dataSubjects: z.array(z.string().trim().min(1).max(80)).min(1, 'Add at least one group.'),
    dataCategories: z.array(dataCategorySchema).min(1, 'Add at least one data category.'),
    sources: z.string().trim().max(1000),
    recipients: z.array(recipientSchema),
    crossBorder: z.object({
      transfers: z.boolean(),
      countries: z.array(z.string().trim().min(1).max(60)),
    }),
    retention: z.string().trim().max(300).nullable(),
    owner: z.string().min(1, 'Choose an owner.'),
    status: processingStatusSchema,
  })
  .refine((v) => !v.crossBorder.transfers || v.crossBorder.countries.length > 0, {
    path: ['crossBorder', 'countries'],
    message: 'Add the countries the data goes to.',
  })
export type ProcessingFormValues = z.infer<typeof processingFormSchema>

export const updateProcessingSchema = processingFormSchema.safeExtend({ ifVersion })

// ---------------------------------------------------------------------------
// Impact assessments
// ---------------------------------------------------------------------------

export const piaRiskSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().min(3, 'Describe the risk.').max(1000),
  likelihood: scoreSchema,
  impact: scoreSchema,
  mitigation: z.string().trim().max(2000),
})

const dataFlowsSchema = z.object({
  collection: z.string().max(4000),
  use: z.string().max(4000),
  storage: z.string().max(4000),
  sharing: z.string().max(4000),
  disposal: z.string().max(4000),
})

export const piaScopeSchema = z.object({
  processingActivityId: z.string().min(1, 'Choose the processing activity this PIA covers.'),
  scope: z.string().trim().min(10, 'Describe what this assessment covers.').max(4000),
})
export type PiaScopeValues = z.infer<typeof piaScopeSchema>

export const createPiaSchema = piaScopeSchema

export const updatePiaSchema = z.object({
  ifVersion,
  processingActivityId: z.string().min(1).optional(),
  scope: z.string().trim().min(10, 'Describe what this assessment covers.').max(4000).optional(),
  dataFlows: dataFlowsSchema.optional(),
  risks: z.array(piaRiskSchema).max(50).optional(),
  currentStep: z.literal([1, 2, 3, 4, 5]).optional(),
})

export const piaDecisionSchema = z.enum(['proceed', 'proceed_with_conditions', 'do_not_proceed'])

export const signOffPiaSchema = z
  .object({
    ifVersion,
    decision: piaDecisionSchema,
    conditions: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => v.decision !== 'proceed_with_conditions' || (v.conditions?.length ?? 0) >= 3, {
    path: ['conditions'],
    message: 'List the conditions that must be met.',
  })

// ---------------------------------------------------------------------------
// Data subject requests
// ---------------------------------------------------------------------------

export const dsrTypeSchema = z.enum([
  'access',
  'correction',
  'erasure',
  'objection',
  'portability',
  'other',
])
export const dsrStatusSchema = z.enum([
  'received',
  'identity_verified',
  'in_progress',
  'responded',
  'closed',
])
export const dsrChannelSchema = z.enum([
  'email',
  'web_form',
  'phone',
  'letter',
  'in_person',
  'other',
])
export const dsrOutcomeSchema = z.enum(['granted', 'partially_granted', 'denied', 'withdrawn'])

export const createDsrSchema = z.object({
  type: dsrTypeSchema,
  requesterName: z.string().trim().min(2, 'Enter the requester’s name.').max(160),
  requesterContact: z.string().trim().min(5, 'Enter an email address or phone number.').max(160),
  channel: dsrChannelSchema,
  description: z.string().trim().max(4000),
  receivedAt: isoDate,
  assignee: z.string().nullable(),
  processingActivityIds: z.array(id),
})
export type DsrFormValues = z.infer<typeof createDsrSchema>

export const updateDsrSchema = z.object({
  ifVersion,
  type: dsrTypeSchema.optional(),
  channel: dsrChannelSchema.optional(),
  description: z.string().trim().max(4000).optional(),
  assignee: z.string().nullable().optional(),
  responseNotes: z.string().trim().max(8000).optional(),
})

export const dsrTransitionSchema = z
  .object({
    ifVersion,
    status: dsrStatusSchema,
    note: z.string().trim().max(2000).optional(),
    outcome: dsrOutcomeSchema.optional(),
  })
  .refine((v) => v.status !== 'responded' || v.outcome, {
    path: ['outcome'],
    message: 'Choose the outcome of the request.',
  })

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

export const incidentStatusSchema = z.enum(['reported', 'triage', 'contained', 'closed'])

export const reportIncidentSchema = z.object({
  title: z.string().trim().min(3, 'Give it a short title.').max(160),
  description: z.string().trim().min(10, 'Describe what happened.').max(8000),
  discoveredAt: isoDateTime.refine(notInFuture, 'The discovery time can’t be in the future.'),
  affectedSummary: z.string().trim().max(2000),
  personalDataInvolved: z.boolean({ error: 'Say whether personal data may be involved.' }),
})
export type ReportIncidentValues = z.infer<typeof reportIncidentSchema>

export const updateIncidentSchema = z.object({
  ifVersion,
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().min(10).max(8000).optional(),
  discoveredAt: isoDateTime
    .refine(notInFuture, 'The discovery time can’t be in the future.')
    .optional(),
  affectedSummary: z.string().trim().max(2000).optional(),
  severity: severitySchema.nullable().optional(),
  personalDataInvolved: z.boolean().optional(),
  affectedCount: z.number().int().min(0, 'Enter 0 or more.').nullable().optional(),
  notificationRequired: z.boolean().nullable().optional(),
  notificationRationale: z.string().trim().max(4000).nullable().optional(),
  status: incidentStatusSchema.optional(),
  postIncidentReview: z.string().trim().max(20_000).nullable().optional(),
})

/** The triage panel form. */
export const triageSchema = z
  .object({
    severity: severitySchema.nullable(),
    affectedCount: z.number().int().min(0, 'Enter 0 or more.').nullable(),
    personalDataInvolved: z.boolean(),
    notificationRequired: z.boolean().nullable(),
    notificationRationale: z.string().trim().max(4000),
  })
  .refine((v) => v.notificationRequired === null || v.notificationRationale.length >= 3, {
    path: ['notificationRationale'],
    message: 'Record why, in a sentence or two.',
  })
export type TriageValues = z.infer<typeof triageSchema>

export const noticeDraftSchema = z.object({
  subject: z.string().trim().min(3, 'Add a subject line.').max(200),
  body: z.string().trim().min(20, 'The notice is too short.').max(20_000),
})

export const updateNoticesSchema = z.object({
  ifVersion,
  npc: noticeDraftSchema.optional(),
  subjects: noticeDraftSchema.optional(),
})

export const noticesVersionSchema = z.object({ ifVersion })

export const recordNotificationSchema = z.object({
  ifVersion,
  kind: z.enum(['npc', 'subjects']),
  at: isoDateTime.refine(notInFuture, 'This can’t be in the future.'),
  reference: z.string().trim().max(120).nullable().optional(),
})

// ---------------------------------------------------------------------------
// Agreements, registration, training
// ---------------------------------------------------------------------------

export const agreementFormSchema = z
  .object({
    counterparty: z.string().trim().min(2, 'Name the other party.').max(160),
    type: z.enum(['dpa', 'data_sharing', 'nda', 'msa']),
    role: z.enum(['we_are_processor', 'we_are_controller']),
    signedAt: isoDate,
    renewsAt: isoDate.nullable(),
    fileId: z.string().nullable(),
    owner: z.string().min(1, 'Choose an owner.'),
    notes: z.string().trim().max(4000),
    processingActivityIds: z.array(id),
  })
  .refine((v) => !v.renewsAt || v.renewsAt > v.signedAt, {
    path: ['renewsAt'],
    message: 'The renewal date must be after the signing date.',
  })
export type AgreementFormValues = z.infer<typeof agreementFormSchema>

export const updateAgreementSchema = agreementFormSchema.safeExtend({ ifVersion })

export const registrationFormSchema = z
  .object({
    reference: z.string().trim().min(3, 'Enter the registration reference.').max(80),
    dpoName: z.string().trim().min(2, 'Enter the DPO on record.').max(160),
    dpoEmail: z.email({ error: 'Enter a valid email address.' }),
    registeredAt: isoDate,
    renewsAt: isoDate,
    notes: z.string().trim().max(4000),
  })
  .refine((v) => v.renewsAt > v.registeredAt, {
    path: ['renewsAt'],
    message: 'The renewal date must be after the registration date.',
  })
export type RegistrationFormValues = z.infer<typeof registrationFormSchema>

export const updateRegistrationSchema = registrationFormSchema.safeExtend({ ifVersion })

export const trainingRecordSchema = z
  .object({
    userId: z.string().min(1, 'Choose a person.'),
    course: z.string().trim().min(3, 'Name the course.').max(120),
    completedAt: isoDate,
    expiresAt: isoDate.nullable(),
  })
  .refine((v) => !v.expiresAt || v.expiresAt > v.completedAt, {
    path: ['expiresAt'],
    message: 'The expiry date must be after completion.',
  })
export type TrainingRecordValues = z.infer<typeof trainingRecordSchema>

// ---------------------------------------------------------------------------
// Cross-cutting: links, reveal, files, risks
// ---------------------------------------------------------------------------

export const recordTypeSchema = z.enum([
  'document',
  'processing_activity',
  'pia',
  'dsr',
  'incident',
  'agreement',
  'system',
  'risk',
  'access_grant',
  'secret_record',
  'change',
  'decision',
  'control',
])

const recordPointer = z.object({ type: recordTypeSchema, id: z.string().min(1) })
export const linkSchema = z.object({ from: recordPointer, to: recordPointer })

export const revealSchema = z.object({
  targetType: z.literal('dsr'),
  targetId: z.string().min(1),
  field: z.enum(['requesterName', 'requesterContact']),
})

export const attachFileSchema = z.object({ fileId: z.string().min(1) })

export const createRiskSchema = z.object({
  title: z.string().trim().min(3, 'Name the risk.').max(160),
  description: z.string().trim().max(4000),
  likelihood: scoreSchema,
  impact: scoreSchema,
  owner: z.string().min(1, 'Choose an owner.'),
  incidentId: z.string().optional(),
})
export type CreateRiskValues = z.infer<typeof createRiskSchema>
