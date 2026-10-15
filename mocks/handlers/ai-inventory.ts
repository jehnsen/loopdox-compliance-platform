import type { AiAssessment, AiUseCase } from '@/lib/api/types'
import { hasFeature } from '@/lib/entitlements'
import { DECISION_LABELS } from '@/lib/ai'
import {
  decideAssessmentSchema,
  updateAssessmentSchema,
  updateUseCaseSchema,
  useCaseFormSchema,
} from '@/lib/schemas/ai'
import { audit } from '@/mocks/audit'
import {
  blankQuestions,
  findAssessment,
  findUseCase,
  orgAssessments,
  orgUseCases,
  summarizeAssessment,
  summarizeUseCase,
} from '@/mocks/ai'
import { searchSources } from '@/mocks/handlers/search'
import { baseFields, touch } from '@/mocks/helpers'
import { checkVersion, HttpError, json, noContent, paginate, parse } from '@/mocks/http'
import { assertMember, nextRef, unprocessable } from '@/mocks/privacy'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit } from '@/mocks/store'

const opts = { feature: 'aiGovernance' as const }

const ucLabel = (u: AiUseCase) => `${u.ref} ${u.name}`

export const aiInventoryRoutes: RouteDef[] = [
  // -------------------------------------------------------------------------
  // Use cases
  // -------------------------------------------------------------------------
  orgRoute('GET', '/ai/use-cases', { ...opts, permission: 'ai.read' }, (ctx) => {
    const items = orgUseCases(ctx).map((u) => summarizeUseCase(ctx, u))
    return json(
      paginate(items, ctx.query, {
        search: (u) => [u.ref, u.name, u.tool, u.provider, u.model, u.purpose, ...u.dataCategories],
        defaultSort: 'ref',
        filters: {
          status: (u, v) => v.includes(u.status),
          risk: (u, v) => v.includes(u.riskLevel),
          assessment: (u, v) => v.includes(u.assessmentState),
          owner: (u, v) => v.includes(u.owner),
        },
      }),
    )
  }),

  orgRoute('POST', '/ai/use-cases', { ...opts, permission: 'ai.edit' }, async (ctx) => {
    const input = parse(useCaseFormSchema, await ctx.json())
    assertMember(ctx, input.owner, 'owner')
    const u: AiUseCase = {
      ...baseFields(ctx, 'aiu'),
      ref: nextRef(
        orgUseCases(ctx).map((x) => x.ref),
        'AI',
      ),
      ...input,
      systemIds: [],
      processingActivityIds: [],
      status: 'proposed',
    }
    ctx.db.aiUseCases.push(u)
    audit(ctx, 'ai_use_case.created', { type: 'ai_use_case', id: u.id, label: ucLabel(u) })
    commit()
    return json(summarizeUseCase(ctx, u), 201)
  }),

  orgRoute('GET', '/ai/use-cases/:id', { ...opts, permission: 'ai.read' }, (ctx) =>
    json(summarizeUseCase(ctx, findUseCase(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/ai/use-cases/:id', { ...opts, permission: 'ai.edit' }, async (ctx) => {
    const { ifVersion, status, ...input } = parse(updateUseCaseSchema, await ctx.json())
    const u = findUseCase(ctx, ctx.params.id ?? '')
    checkVersion(u, ifVersion)
    assertMember(ctx, input.owner, 'owner')
    // Approval and rejection come from an assessment. A person can only retire a use case or reopen it.
    if (status && status !== 'retired' && status !== 'proposed') {
      throw new HttpError(
        400,
        'validation_error',
        'Run an assessment to approve or reject a use case.',
        {
          status: 'Only an assessment can approve or reject.',
        },
      )
    }
    Object.assign(u, input)
    let action = 'ai_use_case.updated'
    if (status && status !== u.status) {
      u.status = status
      action = status === 'retired' ? 'ai_use_case.retired' : 'ai_use_case.reopened'
    }
    touch(ctx, u)
    audit(ctx, action, { type: 'ai_use_case', id: u.id, label: ucLabel(u) })
    commit()
    return json(summarizeUseCase(ctx, u))
  }),

  orgRoute('DELETE', '/ai/use-cases/:id', { ...opts, permission: 'ai.edit' }, (ctx) => {
    const u = findUseCase(ctx, ctx.params.id ?? '')
    const decided = orgAssessments(ctx).some((a) => a.useCaseId === u.id && a.status === 'decided')
    if (u.status !== 'proposed' || decided) {
      throw unprocessable(
        'Only a proposed use case with no decided assessment can be deleted. Retire this one instead; its assessments are kept.',
      )
    }
    ctx.db.aiAssessments = ctx.db.aiAssessments.filter((a) => a.useCaseId !== u.id)
    ctx.db.aiUseCases = ctx.db.aiUseCases.filter((x) => x.id !== u.id)
    audit(ctx, 'ai_use_case.deleted', { type: 'ai_use_case', id: u.id, label: ucLabel(u) })
    commit()
    return noContent()
  }),

  // -------------------------------------------------------------------------
  // Assessments
  // -------------------------------------------------------------------------
  orgRoute('GET', '/ai/assessments', { ...opts, permission: 'ai.read' }, (ctx) => {
    const items = orgAssessments(ctx).map((a) => summarizeAssessment(ctx, a))
    return json(
      paginate(items, ctx.query, {
        search: (a) => [a.ref, a.useCaseRef, a.useCaseName],
        defaultSort: '-ref',
        filters: {
          status: (a, v) => v.includes(a.status),
          decision: (a, v) => v.includes(a.decision ?? 'none'),
          useCaseId: (a, v) => v.includes(a.useCaseId),
          risk: (a, v) => v.includes(a.riskLevel ?? a.suggestedRisk),
        },
      }),
    )
  }),

  // "Run assessment": starts one for a use case. One open assessment per use case.
  orgRoute('POST', '/ai/assessments', { ...opts, permission: 'ai.edit' }, async (ctx) => {
    const body = (await ctx.json()) as { useCaseId?: unknown }
    if (typeof body.useCaseId !== 'string' || !body.useCaseId) {
      throw new HttpError(400, 'validation_error', 'Choose the use case to assess.', {
        useCaseId: 'Choose a use case.',
      })
    }
    const u = findUseCase(ctx, body.useCaseId)
    if (u.status === 'retired')
      throw unprocessable('A retired use case can’t be assessed. Reopen it first.')
    const open = orgAssessments(ctx).find((a) => a.useCaseId === u.id && a.status === 'in_progress')
    if (open) {
      throw unprocessable(
        `${open.ref} is already in progress for ${u.ref}. Finish or cancel it first.`,
      )
    }
    const a: AiAssessment = {
      ...baseFields(ctx, 'aia'),
      ref: nextRef(
        orgAssessments(ctx).map((x) => x.ref),
        'AIA',
      ),
      useCaseId: u.id,
      status: 'in_progress',
      questions: blankQuestions(),
      riskLevel: null,
      humanOversight: null,
      oversightNote: '',
      decision: null,
      conditions: '',
      decidedBy: null,
      decidedAt: null,
    }
    ctx.db.aiAssessments.push(a)
    audit(ctx, 'ai_assessment.started', {
      type: 'ai_assessment',
      id: a.id,
      label: `${a.ref} for ${u.ref}`,
    })
    commit()
    return json(summarizeAssessment(ctx, a), 201)
  }),

  orgRoute('GET', '/ai/assessments/:id', { ...opts, permission: 'ai.read' }, (ctx) =>
    json(summarizeAssessment(ctx, findAssessment(ctx, ctx.params.id ?? ''))),
  ),

  orgRoute('PATCH', '/ai/assessments/:id', { ...opts, permission: 'ai.edit' }, async (ctx) => {
    const body = parse(updateAssessmentSchema, await ctx.json())
    const a = findAssessment(ctx, ctx.params.id ?? '')
    checkVersion(a, body.ifVersion)
    assertOpen(a)
    for (const patch of body.questions ?? []) {
      const q = a.questions.find((x) => x.id === patch.id)
      if (q) {
        q.answer = patch.answer
        q.note = patch.note
      }
    }
    if (body.humanOversight !== undefined) a.humanOversight = body.humanOversight
    if (body.oversightNote !== undefined) a.oversightNote = body.oversightNote
    touch(ctx, a)
    commit()
    return json(summarizeAssessment(ctx, a))
  }),

  /**
   * Decides the assessment. Every question needs an answer. The decision sets the use
   * case's rating and status: approved (with or without conditions) or rejected.
   */
  orgRoute(
    'POST',
    '/ai/assessments/:id/decide',
    { ...opts, permission: 'ai.edit' },
    async (ctx) => {
      const body = parse(decideAssessmentSchema, await ctx.json())
      const a = findAssessment(ctx, ctx.params.id ?? '')
      checkVersion(a, body.ifVersion)
      assertOpen(a)
      const open = a.questions.filter((q) => !q.answer).length
      if (open) {
        throw unprocessable(
          `${open} ${open === 1 ? 'question has' : 'questions have'} no answer yet. Answer every question before deciding.`,
        )
      }
      const u = findUseCase(ctx, a.useCaseId)
      a.status = 'decided'
      a.decision = body.decision
      a.riskLevel = body.riskLevel
      a.humanOversight = body.humanOversight
      a.oversightNote = body.oversightNote
      a.conditions = body.decision === 'approved_with_conditions' ? body.conditions : ''
      a.decidedBy = ctx.user.id
      a.decidedAt = ctx.now.toISOString()
      touch(ctx, a)
      u.riskLevel = body.riskLevel
      u.status = body.decision === 'rejected' ? 'rejected' : 'approved'
      touch(ctx, u)
      audit(
        ctx,
        'ai_assessment.decided',
        { type: 'ai_assessment', id: a.id, label: `${a.ref} for ${u.ref}` },
        { decision: body.decision, risk: body.riskLevel, note: DECISION_LABELS[body.decision] },
      )
      audit(
        ctx,
        'ai_use_case.assessed',
        { type: 'ai_use_case', id: u.id, label: ucLabel(u) },
        {
          decision: body.decision,
          assessment: a.ref,
        },
      )
      commit()
      return json(summarizeAssessment(ctx, a))
    },
  ),

  orgRoute('DELETE', '/ai/assessments/:id', { ...opts, permission: 'ai.edit' }, (ctx) => {
    const a = findAssessment(ctx, ctx.params.id ?? '')
    if (a.status !== 'in_progress') {
      throw unprocessable('A decided assessment is a record and can’t be deleted.')
    }
    ctx.db.aiAssessments = ctx.db.aiAssessments.filter((x) => x.id !== a.id)
    audit(ctx, 'ai_assessment.cancelled', { type: 'ai_assessment', id: a.id, label: a.ref })
    commit()
    return noContent()
  }),
]

function assertOpen(a: AiAssessment): void {
  if (a.status !== 'in_progress') {
    throw unprocessable(`${a.ref} has been decided. Start a new assessment to change the answers.`)
  }
}

// AI use cases are searchable by reference, name, tool, provider, model and purpose.
searchSources.push({
  type: 'ai_use_case',
  label: 'AI use cases',
  items: (ctx: OrgCtx) => {
    if (!hasFeature(ctx.org.tier, 'aiGovernance') || !ctx.can('ai.read')) return []
    return orgUseCases(ctx).map((u) => ({
      type: 'ai_use_case' as const,
      id: u.id,
      ref: u.ref,
      title: u.name,
      href: `/${ctx.org.slug}/ai-governance/inventory/${u.id}`,
      snippet: null,
      text: `${u.tool} ${u.provider} ${u.model} ${u.purpose} ${u.dataCategories.join(' ')}`,
    }))
  },
})
