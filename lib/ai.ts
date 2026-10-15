import type {
  AiAnswer,
  AiAssessmentDecision,
  AiEventAction,
  AiKeyProvider,
  AiKeyStorage,
  AiProfileKey,
  AiRiskLevel,
  AiUseCaseStatus,
} from '@/lib/api/types'

/** Labels, catalogues and small rules for AI Governance, shared by the UI and the mock API. */

export const RISK_LABELS: Record<AiRiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export const USE_CASE_STATUS_LABELS: Record<AiUseCaseStatus, string> = {
  proposed: 'Proposed',
  approved: 'Approved',
  rejected: 'Rejected',
  retired: 'Retired',
}

export const DECISION_LABELS: Record<AiAssessmentDecision, string> = {
  approved: 'Approved',
  approved_with_conditions: 'Approved with conditions',
  rejected: 'Rejected',
}

export const ACTION_LABELS: Record<AiEventAction, string> = {
  masked: 'Masked',
  blocked: 'Blocked',
  allowed: 'Allowed',
}

export const PROFILE_KEYS: readonly AiProfileKey[] = ['law_firm', 'clinic', 'govtech', 'custom']

// ---------------------------------------------------------------------------
// Assessment questions
// ---------------------------------------------------------------------------

export interface AssessmentQuestionDef {
  id: string
  /** Worded so that "Yes" is the riskier answer. */
  q: string
  hint: string
  /** How much a "Yes" adds to the score. */
  weight: number
}

export const ASSESSMENT_QUESTIONS: readonly AssessmentQuestionDef[] = [
  {
    id: 'personal_data',
    q: 'Does the tool receive personal information?',
    hint: 'Names, contact details, account records, anything that identifies a person.',
    weight: 1,
  },
  {
    id: 'sensitive_data',
    q: 'Does it receive sensitive personal information?',
    hint: 'Health, government ID numbers, financial accounts, children’s data or legal matters.',
    weight: 2,
  },
  {
    id: 'decisions',
    q: 'Does it make or inform decisions that significantly affect a person?',
    hint: 'Hiring, credit, care, discipline, eligibility or legal advice.',
    weight: 3,
  },
  {
    id: 'unreviewed_output',
    q: 'Do its outputs reach clients or the public without a person reading them first?',
    hint: 'Auto-sent replies, published text, customer-facing chat.',
    weight: 2,
  },
  {
    id: 'provider_retention',
    q: 'Does the provider keep prompts, or use them to train its models?',
    hint: 'Check the provider’s data terms, not just the product page.',
    weight: 2,
  },
  {
    id: 'offshore',
    q: 'Is data processed outside the Philippines?',
    hint: 'Where the provider runs the model, not where the app is hosted.',
    weight: 1,
  },
  {
    id: 'harm',
    q: 'Could a wrong answer cause legal, financial or safety harm?',
    hint: 'Think of the worst realistic mistake, not the average one.',
    weight: 2,
  },
  {
    id: 'autonomy',
    q: 'Can it reach internal systems or take actions on its own?',
    hint: 'Agents, plug-ins, code execution, sending email, changing records.',
    weight: 2,
  },
]

export const ANSWER_LABELS: Record<AiAnswer, string> = {
  yes: 'Yes',
  no: 'No',
  unsure: 'Not sure',
}

/**
 * The rating the answers point to. A "Yes" adds the question's weight, "Not sure" adds half,
 * and unanswered questions add nothing. Under 3 is low, under 7 medium, otherwise high.
 */
export function suggestedRisk(
  answers: readonly { id: string; answer: AiAnswer | null }[],
): AiRiskLevel {
  let score = 0
  for (const a of answers) {
    const def = ASSESSMENT_QUESTIONS.find((q) => q.id === a.id)
    if (!def || !a.answer) continue
    score += a.answer === 'yes' ? def.weight : a.answer === 'unsure' ? def.weight / 2 : 0
  }
  return score < 3 ? 'low' : score < 7 ? 'medium' : 'high'
}

// ---------------------------------------------------------------------------
// Policy profiles
// ---------------------------------------------------------------------------

export interface RecognizerDef {
  id: string
  label: string
  group: 'Philippine IDs' | 'Contact' | 'Personal' | 'Financial' | 'Technical'
  /** What a match looks like, shown beside the toggle. */
  example: string
}

export const RECOGNIZERS: readonly RecognizerDef[] = [
  { id: 'PH_TIN', label: 'TIN', group: 'Philippine IDs', example: '123-456-789-000' },
  { id: 'PH_SSS', label: 'SSS number', group: 'Philippine IDs', example: '34-1234567-8' },
  {
    id: 'PH_PHILSYS',
    label: 'PhilSys ID (PSN)',
    group: 'Philippine IDs',
    example: '1234-5678-9012-3456',
  },
  {
    id: 'PH_PHILHEALTH',
    label: 'PhilHealth ID',
    group: 'Philippine IDs',
    example: '12-345678901-2',
  },
  { id: 'PERSON_NAME', label: 'Person name', group: 'Personal', example: 'Atty. Maria Reyes' },
  { id: 'EMAIL', label: 'Email address', group: 'Contact', example: 'name@example.com' },
  { id: 'PH_PHONE', label: 'Philippine phone number', group: 'Contact', example: '0917 123 4567' },
  { id: 'CREDIT_CARD', label: 'Card number', group: 'Financial', example: '4111 1111 1111 1111' },
  { id: 'IP_ADDRESS', label: 'IP address', group: 'Technical', example: '203.0.113.42' },
]

export interface GuardrailDef {
  id: string
  label: string
  description: string
}

export const GUARDRAILS: readonly GuardrailDef[] = [
  {
    id: 'prompt_injection',
    label: 'Block prompt injection',
    description: 'Stops prompts that tell the model to ignore its instructions or reveal them.',
  },
  {
    id: 'secrets',
    label: 'Block API keys and secrets',
    description: 'Stops prompts that carry what looks like a key, token or private key.',
  },
  {
    id: 'bulk_export',
    label: 'Block bulk data requests',
    description: 'Stops requests to list or dump every client, patient or employee record.',
  },
  {
    id: 'output_pii',
    label: 'Mask personal data in replies',
    description: 'Applies the recognizers above to what the model sends back, too.',
  },
]

export const PROFILE_LABELS: Record<AiProfileKey, string> = {
  law_firm: 'Law firm',
  clinic: 'Clinic',
  govtech: 'GovTech',
  custom: 'Custom',
}

export const MAX_BLOCKED_TOPICS = 30
export const TOPIC_MAX_LENGTH = 80
export const TEST_PROMPT_MAX = 4000

// ---------------------------------------------------------------------------
// Provider keys
// ---------------------------------------------------------------------------

export const KEY_PROVIDER_LABELS: Record<AiKeyProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  azure_openai: 'Azure OpenAI',
  google: 'Google AI',
  other: 'Other',
}

export const KEY_STORAGE_LABELS: Record<AiKeyStorage, string> = {
  fernet: 'Encrypted in VisorShield (Fernet)',
  azure_key_vault: 'Azure Key Vault',
  byok: 'Bring your own key',
}

export const KEY_MIN_LENGTH = 20

/** Data categories to suggest on a use case. People can add their own. */
export const DATA_CATEGORY_SUGGESTIONS = [
  'Source code',
  'Policy text',
  'Customer names',
  'Contact details',
  'Ticket text',
  'Contracts',
  'Health information',
  'Government ID numbers',
  'Financial records',
  'Employee records',
]
