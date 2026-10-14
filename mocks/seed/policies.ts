/**
 * Policy titles for the 3rdLoop seed tenant. Titles are placeholders except
 * ITD-006; replace them here and run `pnpm mock:reset`.
 */
export const POLICY_SECTIONS = [
  { key: 'governance', title: 'Governance & Risk' },
  { key: 'privacy', title: 'Privacy & Data Protection' },
  { key: 'security', title: 'Information Security' },
  { key: 'operations', title: 'Operations & Resilience' },
  { key: 'ai', title: 'AI Governance' },
] as const

export type PolicySectionKey = (typeof POLICY_SECTIONS)[number]['key']

export const POLICY_TITLES: readonly { docId: string; title: string; section: PolicySectionKey }[] =
  [
    { docId: 'ITD-001', title: 'Document Control Policy', section: 'governance' },
    { docId: 'ITD-002', title: 'Code of Conduct & Corporate Governance', section: 'governance' },
    { docId: 'ITD-003', title: 'Risk Management Policy', section: 'governance' },
    { docId: 'ITD-004', title: 'Data Privacy & Protection Policy', section: 'privacy' },
    { docId: 'ITD-005', title: 'Data Classification & Handling Policy', section: 'privacy' },
    { docId: 'ITD-006', title: 'Information Security Policy', section: 'security' },
    { docId: 'ITD-007', title: 'Access Control Policy', section: 'security' },
    { docId: 'ITD-008', title: 'Acceptable Use Policy', section: 'security' },
    { docId: 'ITD-009', title: 'Asset Management Policy', section: 'security' },
    { docId: 'ITD-010', title: 'Secure Development Policy', section: 'security' },
    { docId: 'ITD-011', title: 'Change Management Policy', section: 'operations' },
    { docId: 'ITD-012', title: 'Incident Response Policy', section: 'operations' },
    {
      docId: 'ITD-013',
      title: 'Business Continuity & Disaster Recovery Policy',
      section: 'operations',
    },
    { docId: 'ITD-014', title: 'Vendor & Third-Party Management Policy', section: 'privacy' },
    { docId: 'ITD-015', title: 'AI Governance & Responsible Use Policy', section: 'ai' },
    { docId: 'ITD-016', title: 'Backup, Retention & Disposal Policy', section: 'operations' },
  ]
