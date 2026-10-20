export type TemplateKey = 'policy' | 'procedure' | 'blank'

export interface PolicyTemplate {
  key: TemplateKey
  name: string
  description: string
  body: string
  requiresApproval: boolean
}

/**
 * Starting structures for new pages. Document control (ID, version, owner,
 * approver, effective and review dates) lives in LoopDox's metadata, so the
 * bodies don't repeat it.
 */
export const TEMPLATES: PolicyTemplate[] = [
  {
    key: 'policy',
    name: 'Policy',
    description:
      'A rule the organisation commits to: purpose, scope, definitions, statements, roles, compliance, references and review.',
    requiresApproval: true,
    body: `## 1. Purpose

Why this policy exists, in one or two sentences.

## 2. Scope

Who and what it applies to: people, systems, data and locations.

## 3. Definitions

- **Term:** what it means in this policy.

## 4. Policy statements

### 4.1 First topic

- A clear, testable statement.

## 5. Roles and responsibilities

- **Owner:** keeps this policy current and answers questions about it.
- **Managers:** make sure their teams follow it.
- **Everyone:** follows it and reports problems.

## 6. Compliance and exceptions

How breaches are handled, and how to request an exception: who approves it and where it's recorded.

## 7. References

The laws and standards this policy helps meet, for example:

- Data Privacy Act of 2012 (RA 10173) and its Implementing Rules and Regulations
- ISO/IEC 27001:2022 Annex A controls this policy covers

## 8. Related documents

- [[ITD-006]]

## 9. Review

This policy is reviewed on the cycle set for it in LoopDox, and sooner after a significant incident, an audit finding or a change in law.
`,
  },
  {
    key: 'procedure',
    name: 'Procedure / SOP',
    description:
      'Step-by-step instructions for a task the policies require: who does each step, what to do when it can’t be followed, and what to keep.',
    requiresApproval: true,
    body: `## 1. Purpose

What this procedure achieves and which policy it supports.

## 2. Scope

Which teams, systems and situations it covers.

## 3. Roles

- **Performer:** who carries out the steps.
- **Approver:** who signs off, if anyone.

## 4. When to use it

The situations or triggers that start this procedure.

## 5. Before you start

- The access, tools or approvals needed first.

## 6. Steps

1. **Performer:** first step.
2. **Performer:** second step.
3. **Performer:** record the result in LoopDox.

## 7. Exceptions and escalation

What to do when a step can't be followed, and who to escalate to.

## 8. Records

What evidence to keep, where, and for how long.

## 9. Related documents

- [[ITD-006]] (the policy this procedure carries out)

## 10. Contacts

Who to ask for help.
`,
  },
  {
    key: 'blank',
    name: 'Blank page',
    description: 'Start from an empty page, for overviews, guides or section pages.',
    requiresApproval: false,
    body: '',
  },
]

export function templateByKey(key: string | null | undefined): PolicyTemplate | undefined {
  return TEMPLATES.find((t) => t.key === key)
}
