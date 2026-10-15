import type {
  Connector,
  ConnectorCheck,
  ConnectorProvider,
  Control,
  Evidence,
  EvidenceResult,
  EvidenceSource,
} from '@/lib/api/types'
import { PROVIDERS, PROVIDER_ORDER } from '@/lib/evidence'
import type { MockFile } from '@/mocks/store'

/**
 * Evidence seed (section 6.2): three connectors (GitHub, Google Workspace and a failing
 * Hostinger, with Azure not yet connected) and an evidence history for the controls.
 * The history agrees with each control's status: passing controls end on a pass, the two
 * failing ones on a fail, and the three "no evidence" controls have none. A.5.15 keeps
 * the single item its access review made in the security seed.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const ORG = 'org_3rdloop'

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
}

interface Entry {
  control: string
  source: Exclude<EvidenceSource, 'connector'>
  daysAgo: number
  result: EvidenceResult
  summary: string
  file?: { name: string; size: number }
}

const ENTRIES: Entry[] = [
  {
    control: 'A.5.1',
    source: 'upload',
    daysAgo: 150,
    result: 'pass',
    summary:
      'Annual management review of the information security policy set. Every policy is approved or in review; minutes attached.',
    file: { name: 'Management review minutes.pdf', size: 214_880 },
  },
  {
    control: 'A.5.2',
    source: 'manual',
    daysAgo: 150,
    result: 'pass',
    summary:
      'Roles and responsibilities confirmed in ITD-006, with an owner named for every system.',
  },
  {
    control: 'A.5.9',
    source: 'upload',
    daysAgo: 35,
    result: 'pass',
    summary:
      'Asset inventory export for the quarter: 10 systems, each with an owner and a classification.',
    file: { name: 'Asset inventory export.xlsx', size: 48_220 },
  },
  {
    control: 'A.5.10',
    source: 'manual',
    daysAgo: 170,
    result: 'pass',
    summary: 'Acceptable use policy ITD-008 acknowledged by all current staff.',
  },
  {
    control: 'A.5.12',
    source: 'manual',
    daysAgo: 190,
    result: 'pass',
    summary:
      'Classification labels set to Public, Internal, Confidential and Restricted, and ITD-005 approved.',
  },
  {
    control: 'A.5.17',
    source: 'manual',
    daysAgo: 60,
    result: 'pass',
    summary: 'Password manager rolled out to all staff; shared passwords retired.',
  },
  {
    control: 'A.5.18',
    source: 'manual',
    daysAgo: 45,
    result: 'pass',
    summary: 'Joiner, mover and leaver checklist completed for the quarter.',
  },
  {
    control: 'A.5.19',
    source: 'upload',
    daysAgo: 100,
    result: 'pass',
    summary: 'Supplier reviews completed for five suppliers; data processing agreements on file.',
    file: { name: 'Supplier review register.xlsx', size: 36_914 },
  },
  {
    control: 'A.5.24',
    source: 'upload',
    daysAgo: 120,
    result: 'pass',
    summary: 'Incident response plan tested with a tabletop exercise. Gaps recorded as actions.',
    file: { name: 'Tabletop exercise notes.pdf', size: 126_340 },
  },
  {
    control: 'A.5.26',
    source: 'manual',
    daysAgo: 20,
    result: 'pass',
    summary:
      'A closed incident was reviewed after the response: lessons recorded and one risk raised.',
  },
  {
    control: 'A.5.30',
    source: 'upload',
    daysAgo: 300,
    result: 'pass',
    summary: 'Business continuity plan approved, with recovery targets for each system.',
    file: { name: 'Business continuity plan sign-off.pdf', size: 98_402 },
  },
  {
    control: 'A.5.30',
    source: 'upload',
    daysAgo: 60,
    result: 'fail',
    summary:
      'Restore test failed: the production database took 9 hours to restore against a 4 hour target.',
    file: { name: 'Restore test report.pdf', size: 154_020 },
  },
  {
    control: 'A.5.31',
    source: 'manual',
    daysAgo: 160,
    result: 'pass',
    summary:
      'Legal and regulatory register reviewed: Data Privacy Act, NPC circulars and client contract duties.',
  },
  {
    control: 'A.5.34',
    source: 'manual',
    daysAgo: 90,
    result: 'pass',
    summary: 'Privacy notice and consent wording checked against ITD-004.',
  },
  {
    control: 'A.6.3',
    source: 'manual',
    daysAgo: 60,
    result: 'pass',
    summary: 'Security awareness training completed by every member of staff.',
  },
  {
    control: 'A.8.2',
    source: 'manual',
    daysAgo: 40,
    result: 'pass',
    summary: 'Privileged accounts listed, each with a named owner and a reason.',
  },
  {
    control: 'A.8.5',
    source: 'upload',
    daysAgo: 25,
    result: 'pass',
    summary: 'Screenshot of single sign-on and multi-factor settings for production systems.',
    file: { name: 'MFA settings.png', size: 182_776 },
  },
  {
    control: 'A.8.8',
    source: 'upload',
    daysAgo: 42,
    result: 'pass',
    summary: 'Monthly vulnerability scan: no critical findings, one medium finding scheduled.',
    file: { name: 'Vulnerability scan report (previous month).pdf', size: 310_448 },
  },
  {
    control: 'A.8.8',
    source: 'upload',
    daysAgo: 12,
    result: 'pass',
    summary: 'Monthly vulnerability scan: no critical findings, two medium findings scheduled.',
    file: { name: 'Vulnerability scan report.pdf', size: 322_190 },
  },
  {
    control: 'A.8.13',
    source: 'manual',
    daysAgo: 80,
    result: 'pass',
    summary: 'Quarterly restore test of the staging database succeeded in 52 minutes.',
  },
  {
    control: 'A.8.24',
    source: 'manual',
    daysAgo: 200,
    result: 'pass',
    summary:
      'Cryptography standard approved: TLS 1.2 or later, AES-256 at rest, keys in the vault.',
  },
  {
    control: 'Sec. 20',
    source: 'manual',
    daysAgo: 100,
    result: 'pass',
    summary: 'Security measures for personal data reviewed against ITD-004 and ITD-006.',
  },
  {
    control: 'Sec. 16',
    source: 'manual',
    daysAgo: 30,
    result: 'pass',
    summary: 'Data subject request procedure tested. Closed requests were answered on time.',
  },
  {
    control: 'Sec. 21',
    source: 'manual',
    daysAgo: 100,
    result: 'pass',
    summary: 'Data processing agreements are in place for every processor holding personal data.',
  },
  {
    control: 'Circular 16-03',
    source: 'manual',
    daysAgo: 45,
    result: 'pass',
    summary:
      'Breach response procedure and the 72-hour notification clock reviewed against the last closed incident.',
  },
  {
    control: 'Circular 2022-04',
    source: 'manual',
    daysAgo: 300,
    result: 'pass',
    summary: 'NPC registration is current and its renewal is tracked in LoopDox.',
  },
]

interface Outcome {
  result: 'pass' | 'fail'
  detail: string
}

/**
 * What each connector check finds. Mock only: a real connector asks the provider.
 * Google's 2-step check fails, which is why A.5.17 is failing in the seed.
 */
export const MOCK_CHECK_OUTCOMES: Record<string, Outcome> = {
  'github.branch_protection': { result: 'pass', detail: 'Protected on 14 of 14 repositories.' },
  'github.secret_scanning': { result: 'pass', detail: 'Enabled on 14 of 14 repositories.' },
  'azure.activity_logs': {
    result: 'pass',
    detail: 'Activity logs are kept for 400 days on 2 of 2 subscriptions.',
  },
  'azure.encryption': { result: 'pass', detail: 'All 6 storage accounts are encrypted at rest.' },
  'google.two_step': {
    result: 'fail',
    detail: '2 of 14 accounts aren’t enrolled in 2-step verification.',
  },
  'google.inactive': { result: 'pass', detail: 'No account has been inactive for over 90 days.' },
  'hostinger.backups': { result: 'pass', detail: 'Daily backups are on for 3 of 3 sites.' },
  'hostinger.certificates': {
    result: 'pass',
    detail: 'The shortest certificate has 61 days left.',
  },
}

/** What a check finds when it passes, for providers a run reaches for the first time. */
export const PASS_FALLBACK: Outcome = { result: 'pass', detail: 'The check passed.' }

export interface EvidenceSeed {
  connectors: Connector[]
  evidence: Evidence[]
  files: MockFile[]
}

export function seedEvidence(now: Date, controls: Control[]): EvidenceSeed {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
  const byRef = (ref: string): Control => {
    const c = controls.find((x) => x.reference === ref)
    if (!c) throw new Error(`Missing seed control ${ref}`)
    return c
  }
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_')

  const files: MockFile[] = []
  const evidence: Evidence[] = []
  const counters = new Map<string, number>()
  const nextId = (key: string) => {
    const n = (counters.get(key) ?? 0) + 1
    counters.set(key, n)
    return `evd_${slug(key)}_${n}`
  }

  const base = (id: string, at: string, by: string) => ({
    id,
    orgId: ORG,
    createdAt: at,
    updatedAt: at,
    createdBy: by,
    updatedBy: by,
    version: 1,
    sample: true as const,
  })

  for (const e of ENTRIES) {
    const control = byRef(e.control)
    const id = nextId(e.control)
    const at = ago(e.daysAgo * DAY)
    let fileId: string | null = null
    if (e.file) {
      fileId = `file_${id}`
      const ext = e.file.name.split('.').pop() ?? 'pdf'
      files.push({
        id: fileId,
        orgId: ORG,
        name: e.file.name,
        size: e.file.size,
        contentType: CONTENT_TYPES[ext] ?? 'application/pdf',
        uploadedAt: at,
        uploadedBy: 'usr_jehnsen',
      })
    }
    evidence.push({
      ...base(id, at, 'usr_jehnsen'),
      controlId: control.id,
      source: e.source,
      connectorId: null,
      collectedAt: at,
      result: e.result,
      summary: e.summary,
      fileId,
      origin: null,
    })
  }

  // -------------------------------------------------------------------------
  // Connectors
  // -------------------------------------------------------------------------
  interface Plan {
    status: Connector['status']
    account: string | null
    connectedDaysAgo: number | null
    /** When the last attempt ran. */
    lastRunMs: number | null
    /** When the checks last came back with results (before a failure, this is earlier). */
    lastGoodMs: number | null
    lastError: Connector['lastError']
  }
  const plans: Record<ConnectorProvider, Plan> = {
    github: {
      status: 'connected',
      account: '3rdloop',
      connectedDaysAgo: 120,
      lastRunMs: 3 * HOUR,
      lastGoodMs: 3 * HOUR,
      lastError: null,
    },
    azure: {
      status: 'disconnected',
      account: null,
      connectedDaysAgo: null,
      lastRunMs: null,
      lastGoodMs: null,
      lastError: null,
    },
    google_workspace: {
      status: 'connected',
      account: '3rdloop.example',
      connectedDaysAgo: 120,
      lastRunMs: 3 * HOUR,
      lastGoodMs: 3 * HOUR,
      lastError: null,
    },
    hostinger: {
      status: 'error',
      account: 'ops@3rdloop.example',
      connectedDaysAgo: 90,
      lastRunMs: 30 * HOUR,
      lastGoodMs: 54 * HOUR,
      lastError: {
        message: 'Hostinger rejected the saved API token (401 Unauthorized).',
        fixHint:
          'Create a new API token in hPanel under Account, then API, and choose Reconfigure to connect again.',
        at: ago(30 * HOUR),
      },
    },
  }

  const connectors: Connector[] = PROVIDER_ORDER.map((provider) => {
    const plan = plans[provider]
    const id = `con_${provider}`
    const created = ago((plan.connectedDaysAgo ?? 30) * DAY)
    const checks: ConnectorCheck[] = PROVIDERS[provider].checks.map((def) => {
      const control = byRef(def.control)
      const ran = plan.lastGoodMs !== null
      const outcome = MOCK_CHECK_OUTCOMES[def.id] ?? PASS_FALLBACK
      return {
        id: def.id,
        name: def.name,
        controlId: control.id,
        controlReference: control.reference,
        lastResult: ran ? outcome.result : null,
        detail: ran ? outcome.detail : null,
        checkedAt: plan.lastGoodMs !== null ? ago(plan.lastGoodMs) : null,
      }
    })

    // A run a week before the last good one, plus the last good one itself.
    if (plan.lastGoodMs !== null) {
      for (const check of checks) {
        const outcome = MOCK_CHECK_OUTCOMES[check.id] ?? PASS_FALLBACK
        const name = PROVIDERS[provider].name
        for (const [msAgo, result, detail] of [
          [plan.lastGoodMs + 7 * DAY, 'pass', passDetail(check.id, outcome.detail)],
          [plan.lastGoodMs, outcome.result, outcome.detail],
        ] as const) {
          const at = ago(msAgo)
          evidence.push({
            ...base(nextId(`${provider}_${check.controlReference}`), at, 'system'),
            controlId: check.controlId,
            source: 'connector',
            connectorId: id,
            checkId: check.id,
            collectedAt: at,
            result,
            summary: `${name}: ${check.name}. ${detail}`,
            fileId: null,
            origin: null,
          })
        }
      }
    }

    return {
      ...base(id, created, 'usr_jehnsen'),
      createdAt: created,
      provider,
      status: plan.status,
      account: plan.account,
      connectedAt: plan.connectedDaysAgo !== null ? ago(plan.connectedDaysAgo * DAY) : null,
      lastRunAt: plan.lastRunMs !== null ? ago(plan.lastRunMs) : null,
      lastError: plan.lastError,
      checks,
    }
  })

  return { connectors, evidence, files }
}

/** The earlier run found nothing wrong, even where the latest run does. */
function passDetail(checkId: string, latest: string): string {
  return checkId === 'google.two_step'
    ? 'All 14 accounts are enrolled in 2-step verification.'
    : latest
}
