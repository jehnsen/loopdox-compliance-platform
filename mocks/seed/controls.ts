import type { Control, ControlStatus, Framework } from '@/lib/api/types'

/**
 * 30 controls for 3rdLoop: ISO/IEC 27001:2022 Annex A, Data Privacy Act (RA 10173)
 * and NPC references. `docs` lists the policy IDs that implement each control.
 * Evidence history is seeded in M6.
 */
const CONTROLS: {
  key: string
  framework: Framework
  reference: string
  title: string
  description: string
  docs: string[]
  frequency: Control['evidenceFrequency']
  status: ControlStatus
}[] = [
  { key: 'a_5_1', framework: 'ISO27001:2022', reference: 'A.5.1', title: 'Policies for information security', description: 'An information security policy and topic-specific policies are defined, approved, published, communicated, acknowledged and reviewed.', docs: ['ITD-006', 'ITD-001'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_2', framework: 'ISO27001:2022', reference: 'A.5.2', title: 'Information security roles and responsibilities', description: 'Information security roles and responsibilities are defined and allocated.', docs: ['ITD-006'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_9', framework: 'ISO27001:2022', reference: 'A.5.9', title: 'Inventory of information and other associated assets', description: 'An inventory of information and associated assets, including owners, is developed and maintained.', docs: ['ITD-009'], frequency: 'quarterly', status: 'passing' },
  { key: 'a_5_10', framework: 'ISO27001:2022', reference: 'A.5.10', title: 'Acceptable use of information and other associated assets', description: 'Rules for acceptable use of information and assets are identified, documented and implemented.', docs: ['ITD-008'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_12', framework: 'ISO27001:2022', reference: 'A.5.12', title: 'Classification of information', description: 'Information is classified according to the security needs of the organisation.', docs: ['ITD-005'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_15', framework: 'ISO27001:2022', reference: 'A.5.15', title: 'Access control', description: 'Rules to control physical and logical access are established and implemented based on business and security requirements.', docs: ['ITD-007', 'ITD-006'], frequency: 'quarterly', status: 'passing' },
  { key: 'a_5_17', framework: 'ISO27001:2022', reference: 'A.5.17', title: 'Authentication information', description: 'Allocation and management of authentication information is controlled.', docs: ['ITD-007'], frequency: 'continuous', status: 'failing' },
  { key: 'a_5_18', framework: 'ISO27001:2022', reference: 'A.5.18', title: 'Access rights', description: 'Access rights are provisioned, reviewed, modified and removed according to policy.', docs: ['ITD-007'], frequency: 'quarterly', status: 'passing' },
  { key: 'a_5_19', framework: 'ISO27001:2022', reference: 'A.5.19', title: 'Information security in supplier relationships', description: 'Processes are defined to manage the security risks of supplier products and services.', docs: ['ITD-014'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_23', framework: 'ISO27001:2022', reference: 'A.5.23', title: 'Information security for use of cloud services', description: 'Processes for acquiring, using, managing and exiting cloud services are established.', docs: ['ITD-014', 'ITD-006'], frequency: 'annually', status: 'no_evidence' },
  { key: 'a_5_24', framework: 'ISO27001:2022', reference: 'A.5.24', title: 'Incident management planning and preparation', description: 'Incident management processes, roles and responsibilities are defined and communicated.', docs: ['ITD-012'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_26', framework: 'ISO27001:2022', reference: 'A.5.26', title: 'Response to information security incidents', description: 'Incidents are responded to according to documented procedures.', docs: ['ITD-012'], frequency: 'continuous', status: 'passing' },
  { key: 'a_5_30', framework: 'ISO27001:2022', reference: 'A.5.30', title: 'ICT readiness for business continuity', description: 'ICT readiness is planned, implemented, maintained and tested based on continuity objectives.', docs: ['ITD-013'], frequency: 'annually', status: 'failing' },
  { key: 'a_5_31', framework: 'ISO27001:2022', reference: 'A.5.31', title: 'Legal, statutory, regulatory and contractual requirements', description: 'Relevant legal, regulatory and contractual requirements are identified and kept up to date.', docs: ['ITD-004'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_34', framework: 'ISO27001:2022', reference: 'A.5.34', title: 'Privacy and protection of PII', description: 'Requirements for the preservation of privacy and protection of PII are identified and met.', docs: ['ITD-004'], frequency: 'annually', status: 'passing' },
  { key: 'a_5_37', framework: 'ISO27001:2022', reference: 'A.5.37', title: 'Documented operating procedures', description: 'Operating procedures for information processing facilities are documented and made available.', docs: ['ITD-001'], frequency: 'annually', status: 'no_evidence' },
  { key: 'a_6_3', framework: 'ISO27001:2022', reference: 'A.6.3', title: 'Information security awareness, education and training', description: 'Personnel receive appropriate awareness education and training, and regular updates.', docs: ['ITD-006', 'ITD-008'], frequency: 'annually', status: 'passing' },
  { key: 'a_8_2', framework: 'ISO27001:2022', reference: 'A.8.2', title: 'Privileged access rights', description: 'Allocation and use of privileged access rights is restricted and managed.', docs: ['ITD-007'], frequency: 'quarterly', status: 'passing' },
  { key: 'a_8_5', framework: 'ISO27001:2022', reference: 'A.8.5', title: 'Secure authentication', description: 'Secure authentication technologies and procedures are implemented.', docs: ['ITD-007', 'ITD-006'], frequency: 'continuous', status: 'passing' },
  { key: 'a_8_8', framework: 'ISO27001:2022', reference: 'A.8.8', title: 'Management of technical vulnerabilities', description: 'Information about technical vulnerabilities is obtained, exposure evaluated and measures taken.', docs: ['ITD-006', 'ITD-010'], frequency: 'monthly', status: 'passing' },
  { key: 'a_8_13', framework: 'ISO27001:2022', reference: 'A.8.13', title: 'Information backup', description: 'Backup copies are maintained and regularly tested according to the backup policy.', docs: ['ITD-016'], frequency: 'quarterly', status: 'passing' },
  { key: 'a_8_15', framework: 'ISO27001:2022', reference: 'A.8.15', title: 'Logging', description: 'Logs that record activities, exceptions and faults are produced, stored, protected and analysed.', docs: ['ITD-006'], frequency: 'monthly', status: 'no_evidence' },
  { key: 'a_8_24', framework: 'ISO27001:2022', reference: 'A.8.24', title: 'Use of cryptography', description: 'Rules for the effective use of cryptography, including key management, are defined and implemented.', docs: ['ITD-006', 'ITD-005'], frequency: 'annually', status: 'passing' },
  { key: 'a_8_25', framework: 'ISO27001:2022', reference: 'A.8.25', title: 'Secure development life cycle', description: 'Rules for the secure development of software and systems are established and applied.', docs: ['ITD-010'], frequency: 'continuous', status: 'passing' },
  { key: 'a_8_32', framework: 'ISO27001:2022', reference: 'A.8.32', title: 'Change management', description: 'Changes to information processing facilities and systems are subject to change management procedures.', docs: ['ITD-011'], frequency: 'continuous', status: 'passing' },
  { key: 'dpa_20', framework: 'DPA', reference: 'Sec. 20', title: 'Security of personal information', description: 'Implement reasonable and appropriate organisational, physical and technical measures to protect personal information.', docs: ['ITD-004', 'ITD-006'], frequency: 'annually', status: 'passing' },
  { key: 'dpa_16', framework: 'DPA', reference: 'Sec. 16', title: 'Rights of the data subject', description: 'Data subjects can exercise their rights to be informed, access, object, erase, rectify and port their data.', docs: ['ITD-004'], frequency: 'continuous', status: 'passing' },
  { key: 'dpa_21', framework: 'DPA', reference: 'Sec. 21', title: 'Principle of accountability', description: 'The controller is responsible for personal information transferred to third parties for processing.', docs: ['ITD-014'], frequency: 'annually', status: 'passing' },
  { key: 'npc_16_03', framework: 'NPC', reference: 'Circular 16-03', title: 'Personal data breach management', description: 'Breaches are assessed and, where required, notified to the NPC and data subjects within 72 hours of knowledge.', docs: ['ITD-012', 'ITD-004'], frequency: 'continuous', status: 'passing' },
  { key: 'npc_2022_04', framework: 'NPC', reference: 'Circular 2022-04', title: 'Registration of personal data processing systems', description: 'Qualifying processing systems and the DPO are registered with the NPC and kept current.', docs: ['ITD-004'], frequency: 'annually', status: 'passing' },
]

export function seedControls(now: Date, docIdToId: Map<string, string>): Control[] {
  const at = new Date(now.getTime() - 200 * 86_400_000).toISOString()
  return CONTROLS.map((c) => ({
    id: `ctl_${c.key}`,
    orgId: 'org_3rdloop',
    createdAt: at,
    updatedAt: at,
    createdBy: 'usr_jehnsen',
    updatedBy: 'usr_jehnsen',
    version: 1,
    sample: true,
    framework: c.framework,
    reference: c.reference,
    title: c.title,
    description: c.description,
    documentIds: c.docs.flatMap((d) => docIdToId.get(d) ?? []),
    owner: 'usr_jehnsen',
    evidenceFrequency: c.frequency,
    status: c.status,
  }))
}
