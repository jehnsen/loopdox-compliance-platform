import type { ReactNode } from 'react'
import { StatusPill } from '@/components/status-pill'
import type { Crumb } from '@/components/page-header'
import type { EvidenceResult } from '@/lib/api/types'
import { RESULT_LABELS } from '@/lib/evidence'

/** Breadcrumbs for an Evidence page: Evidence › Section › …rest. */
export function evidenceCrumbs(section: Crumb, ...rest: Crumb[]): Crumb[] {
  return [{ label: 'Evidence' }, section, ...rest]
}

export const evidencePaths = {
  controls: (org: string) => `/${org}/evidence/controls`,
  control: (org: string, id: string, evidenceId?: string) =>
    `/${org}/evidence/controls/${id}${evidenceId ? `#${evidenceId}` : ''}`,
  connectors: (org: string) => `/${org}/evidence/connectors`,
  uploads: (org: string) => `/${org}/evidence/uploads`,
  auditPack: (org: string) => `/${org}/evidence/audit-pack`,
}

const RESULT_STATUS = {
  pass: 'passing',
  fail: 'failing',
  info: 'pending',
} as const

/** Pass, Fail or Info, in the same pill as a control's status. */
export function ResultPill({ result }: { result: EvidenceResult }): ReactNode {
  return <StatusPill status={RESULT_STATUS[result]} label={RESULT_LABELS[result]} />
}
