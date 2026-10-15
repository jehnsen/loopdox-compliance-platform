import {
  BadgeCheckIcon,
  DatabaseIcon,
  FileTextIcon,
  NetworkIcon,
  type LucideIcon,
} from 'lucide-react'
import type { AskContext, AskRoute, CitationKind, RecordType } from '@/lib/api/types'
import type { Feature } from '@/lib/entitlements'

export const ROUTES: { value: AskRoute; label: string; feature: Feature; hint: string }[] = [
  {
    value: 'policy',
    label: 'Policies',
    feature: 'ask.policy',
    hint: 'Answer from approved policy text',
  },
  {
    value: 'records',
    label: 'Records',
    feature: 'ask.records',
    hint: 'Answer from the privacy and security registers',
  },
  {
    value: 'impact',
    label: 'Impact',
    feature: 'ask.impact',
    hint: 'Trace what a change to a record touches',
  },
]

export const ROUTE_BADGE: Record<AskRoute, { label: string; icon: LucideIcon }> = {
  policy: { label: 'From approved policies', icon: FileTextIcon },
  records: { label: 'From your records', icon: DatabaseIcon },
  impact: { label: 'Impact across linked records', icon: NetworkIcon },
}

export const CITATION_ICON: Record<CitationKind, LucideIcon> = {
  policy_section: FileTextIcon,
  record: DatabaseIcon,
  evidence: BadgeCheckIcon,
}

/** Path segments under /[org] that identify a record page, for Quick Ask context. */
const RECORD_PATHS: [RegExp, RecordType][] = [
  [/^\/policies\/(?!new$)([^/]+)/, 'document'],
  [/^\/privacy\/processing\/(?!new$)([^/]+)/, 'processing_activity'],
  [/^\/privacy\/pia\/(?!new$)([^/]+)/, 'pia'],
  [/^\/privacy\/requests\/(?!new$)([^/]+)/, 'dsr'],
  [/^\/privacy\/incidents\/(?!report$)([^/]+)/, 'incident'],
  [/^\/privacy\/agreements\/(?!new$)([^/]+)/, 'agreement'],
  [/^\/security\/assets\/(?!new$)([^/]+)/, 'system'],
  [/^\/security\/risks\/(?!new$)([^/]+)/, 'risk'],
  [/^\/security\/decisions\/(?!new$)([^/]+)/, 'decision'],
  [/^\/evidence\/controls\/([^/]+)/, 'control'],
]

/** The record a page shows, from its path ("/3rdloop/policies/doc_itd_007" → document). */
export function contextFromPath(pathname: string, org: string): AskContext | null {
  const sub = pathname.startsWith(`/${org}`) ? pathname.slice(org.length + 1) : pathname
  for (const [re, type] of RECORD_PATHS) {
    const id = re.exec(sub)?.[1]
    if (id) return { type, id: decodeURIComponent(id) }
  }
  return null
}

/** Questions the policy text answers, for well-known policies. */
const POLICY_SUGGESTIONS: Record<string, string[]> = {
  doc_itd_004: [
    'How long do we have to answer a data subject request?',
    'When is a privacy impact assessment needed?',
  ],
  doc_itd_006: ['What has to be encrypted?', 'How quickly are critical patches applied?'],
  doc_itd_007: [
    'What does this policy require for MFA?',
    'How quickly is access removed when someone leaves?',
  ],
  doc_itd_008: [
    'Can I paste client data into public AI tools?',
    'What do I do if I lose my laptop?',
  ],
  doc_itd_012: [
    'How quickly must we notify the NPC of a breach?',
    'When are clients told about an incident?',
  ],
  doc_itd_016: ['How long are backups kept?', 'How often are restores tested?'],
}

/** General starter questions, each offered only when the org has the policy that answers it. */
const GENERAL: { docId: string; question: string }[] = [
  { docId: 'ITD-007', question: 'What does the Access Control Policy require for MFA?' },
  { docId: 'ITD-012', question: 'How quickly must we notify the NPC of a breach?' },
  { docId: 'ITD-008', question: 'Can I paste client data into ChatGPT?' },
  { docId: 'CLN-001', question: 'How are patient records protected?' },
  { docId: 'CLN-003', question: 'What do I do if patient information is lost?' },
  { docId: 'CLN-002', question: 'How do we send records to other providers?' },
]

/** Starter questions for the page Ask was opened from, limited to policies the org has. */
export function suggestionsFor(context: AskContext | null, docIds: ReadonlySet<string>): string[] {
  const general = GENERAL.filter((g) => docIds.has(g.docId)).map((g) => g.question)
  if (context?.type === 'document') {
    return [...(POLICY_SUGGESTIONS[context.id] ?? []), 'Summarise this policy'].slice(0, 3)
  }
  if (context) return ['What does this record affect?', ...general.slice(0, 2)]
  return general.slice(0, 3)
}
