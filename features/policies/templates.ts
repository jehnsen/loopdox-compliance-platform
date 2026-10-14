export type TemplateKey = 'policy' | 'procedure' | 'blank'

export interface PolicyTemplate {
  key: TemplateKey
  name: string
  description: string
  body: string
  requiresApproval: boolean
}

export const TEMPLATES: PolicyTemplate[] = [
  {
    key: 'policy',
    name: 'Policy',
    description: 'A rule the organisation commits to: purpose, scope, statements, roles, compliance and review.',
    requiresApproval: true,
    body: `## 1. Purpose

Why this policy exists, in one or two sentences.

## 2. Scope

Who and what it applies to.

## 3. Policy statements

### 3.1 First topic

- A clear, testable statement.

## 4. Roles and responsibilities

- **Owner:** keeps this policy current.
- **Everyone:** follows it and reports problems.

## 5. Compliance and exceptions

How breaches are handled and how to request an exception.

## 6. Related documents

- [[ITD-006]]

## 7. Review

This policy is reviewed at least every 12 months.
`,
  },
  {
    key: 'procedure',
    name: 'Procedure / SOP',
    description: 'Step-by-step instructions for carrying out a task the policies require.',
    requiresApproval: true,
    body: `## 1. Purpose

What this procedure achieves and which policy it supports.

## 2. When to use it

The situations or triggers that start this procedure.

## 3. Steps

1. First step.
2. Second step.
3. Record the result in LoopDox.

## 4. Records

What evidence to keep, and where.

## 5. Contacts

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
