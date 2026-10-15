import type { QuestionnaireRowStatus } from '@/lib/api/types'
import { can } from '@/lib/auth/permissions'
import { answerFromPolicies, draftQuestionnaireAnswer, type AskCtx } from '@/mocks/ask/policies'
import type { MockAskMessage, MockAskThread, MockDB, MockQuestionnaire } from '@/mocks/store'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * Sample Ask history and a vendor questionnaire half-way through review. Both are
 * drafted by the same retrieval the API uses, from the seeded approved policies.
 */
export function seedAsk(
  db: MockDB,
  now: Date,
): Pick<MockDB, 'askThreads' | 'askMessages' | 'questionnaires'> {
  const org = db.orgs.find((o) => o.id === 'org_3rdloop')
  if (!org) return { askThreads: [], askMessages: [], questionnaires: [] }
  const roles = ['admin', 'dpo', 'cto'] as const
  const ctx: AskCtx = { db, org, roles: [...roles], can: (p) => can({ roles }, p) }
  const iso = (ms: number) => new Date(ms).toISOString()

  // One earlier conversation for Jehnsen.
  const start = now.getTime() - DAY - 3 * HOUR
  const thread: MockAskThread = {
    id: 'thr_seed_1',
    orgId: org.id,
    userId: 'usr_jehnsen',
    title: 'What does the Access Control Policy require for MFA?',
    createdAt: iso(start),
    updatedAt: iso(start + 6 * 60_000),
  }
  const messages: MockAskMessage[] = []
  const questions = [
    'What does the Access Control Policy require for MFA?',
    'How quickly must we notify the NPC of a breach?',
  ]
  questions.forEach((q, i) => {
    const at = start + i * 5 * 60_000
    const a = answerFromPolicies(ctx, q)
    const base = {
      orgId: org.id,
      userId: 'usr_jehnsen',
      threadId: thread.id,
      asOf: null,
      feedback: null,
    }
    messages.push({
      ...base,
      id: `msg_seed_${i * 2 + 1}`,
      role: 'user',
      content: q,
      citations: [],
      route: null,
      grounded: true,
      suggestions: [],
      createdAt: iso(at),
    })
    messages.push({
      ...base,
      id: `msg_seed_${i * 2 + 2}`,
      role: 'assistant',
      content: a.content,
      citations: a.citations,
      route: a.route,
      grounded: a.grounded,
      suggestions: a.suggestions,
      feedback: i === 0 ? { rating: 'up', note: null, at: iso(at + 60_000) } : null,
      createdAt: iso(at + 20_000),
    })
  })

  // A client's vendor assessment: four answers approved, two edited, the rest to review.
  const header = ['#', 'Domain', 'Question', 'Vendor response', 'Comments']
  const items: [string, string][] = [
    ['Access control', 'Do you require multi-factor authentication for all accounts?'],
    ['Access control', 'How often are user access rights reviewed?'],
    ['Data protection', 'Is customer data encrypted at rest and in transit?'],
    [
      'Data protection',
      'How long do you retain customer personal data, and how is it disposed of?',
    ],
    [
      'Incident management',
      'How quickly will you notify us of a security incident affecting our data?',
    ],
    [
      'Incident management',
      'Do you notify the National Privacy Commission of personal data breaches?',
    ],
    [
      'Change management',
      'Are changes to production systems reviewed and approved before deployment?',
    ],
    ['Business continuity', 'Do you back up production data, and how often are restores tested?'],
    ['Third parties', 'Do your subcontractors sign data processing agreements?'],
    ['AI', 'Do you use generative AI tools with customer data?'],
    ['Insurance', 'Do you carry cyber liability insurance? State the insurer and limit.'],
    ['Assurance', 'Provide the date of your most recent SOC 2 Type II report.'],
  ]
  const cells = items.map(([domain, q], i) => [String(i + 1), domain, q, '', ''])
  const uploaded = now.getTime() - 3 * DAY
  const plan: QuestionnaireRowStatus[] = [
    'approved',
    'approved',
    'approved',
    'edited',
    'approved',
    'edited',
  ]
  const rows: MockQuestionnaire['rows'] = items.map(([, q], i) => {
    const draft = draftQuestionnaireAnswer(ctx, q)
    let status: QuestionnaireRowStatus = draft ? 'draft' : 'needs_input'
    let answer = draft?.answer ?? ''
    if (draft && plan[i]) status = plan[i]
    if (status === 'edited') answer = `${answer} We can share evidence on request.`
    const touched = status === 'approved' || status === 'edited'
    return {
      id: `qrow_seed_${i + 1}`,
      version: touched ? 2 : 1,
      index: i + 1,
      cellRow: i,
      question: q,
      draftAnswer: answer,
      citations: draft?.citations ?? [],
      status,
      editor: touched ? 'usr_jehnsen' : null,
      updatedAt: iso(uploaded + (touched ? DAY + i * HOUR : 60_000)),
    }
  })
  const questionnaire: MockQuestionnaire = {
    id: 'qnr_seed_1',
    orgId: org.id,
    createdAt: iso(uploaded),
    updatedAt: iso(uploaded + 2 * DAY),
    createdBy: 'usr_jehnsen',
    updatedBy: 'usr_jehnsen',
    version: 2,
    sample: true,
    name: 'Vendor security assessment 2026',
    client: 'Harbor Point Savings Bank',
    fileName: 'Harbor Point vendor security assessment 2026.xlsx',
    format: 'xlsx',
    sheetName: 'Assessment',
    uploadedAt: iso(uploaded),
    uploadedBy: 'usr_jehnsen',
    header,
    cells,
    mapping: { questionColumn: 2, answerColumn: 3 },
    rows,
  }
  return { askThreads: [thread], askMessages: messages, questionnaires: [questionnaire] }
}
