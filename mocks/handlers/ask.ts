import { formatInTimeZone } from 'date-fns-tz'
import type { AskMessage, AskStreamEvent, AskThread, AskThreadDetail } from '@/lib/api/types'
import { FEATURE_INFO, minimumTierFor, TIER_LABELS } from '@/lib/entitlements'
import { askFeedbackSchema, askRequestSchema } from '@/lib/schemas/ask'
import { todayInTz } from '@/lib/utils/dates'
import { allowedRoutes, answer, tokenize } from '@/mocks/ask/engine'
import { forbidden, HttpError, json, noContent, notFound, paginate, parse } from '@/mocks/http'
import { usageFor } from '@/mocks/handlers/me'
import { orgRoute, type OrgCtx, type RouteDef } from '@/mocks/router'
import { commit, newId, type MockAskMessage, type MockAskThread } from '@/mocks/store'

/** Delay between streamed tokens. MOCK_STREAM_DELAY_MS overrides (0 in unit tests). */
function tokenDelay(): number {
  const v = Number(process.env.MOCK_STREAM_DELAY_MS ?? (process.env.VITEST ? 0 : 30))
  return Number.isFinite(v) && v >= 0 ? v : 30
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function sse(e: AskStreamEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`
}

function threadFor(ctx: OrgCtx, id: string): MockAskThread {
  const t = ctx.db.askThreads.find(
    (x) => x.id === id && x.orgId === ctx.org.id && x.userId === ctx.user.id,
  )
  if (!t) throw notFound('Conversation')
  return t
}

function toMessage(m: MockAskMessage): AskMessage {
  const { orgId: _orgId, userId: _userId, ...rest } = m
  return rest
}

function toThread(ctx: OrgCtx, t: MockAskThread): AskThread {
  return { ...t, messageCount: ctx.db.askMessages.filter((m) => m.threadId === t.id).length }
}

/** Counts a question against the month's usage (tenant timezone). */
function countQuestion(ctx: OrgCtx): void {
  const month = formatInTimeZone(ctx.now, ctx.org.timezone, 'yyyy-MM')
  const row = ctx.db.usage.find((u) => u.orgId === ctx.org.id && u.month === month)
  if (row) row.askQuestions += 1
  else ctx.db.usage.push({ orgId: ctx.org.id, month, askQuestions: 1 })
}

export const askRoutes: RouteDef[] = [
  /**
   * Ask a question. Validation, plan and permission errors are JSON (before the
   * stream starts); everything after that arrives as Server-Sent Events.
   */
  orgRoute('POST', '/ask', { permission: 'ask.use', feature: 'ask.policy' }, async (ctx) => {
    const input = parse(askRequestSchema, await ctx.json())
    const allowed = allowedRoutes(ctx)
    if (input.route && !allowed.includes(input.route)) {
      const feature = input.route === 'records' ? 'ask.records' : 'ask.impact'
      if (allowedRoutes({ ...ctx, roles: ['owner'] }).includes(input.route)) {
        throw forbidden('Your role can ask about approved policies and evidence only.')
      }
      throw new HttpError(
        403,
        'feature_not_in_plan',
        `${FEATURE_INFO[feature].title} is included in the ${TIER_LABELS[minimumTierFor(feature)]} plan.`,
      )
    }
    if (input.asOf && input.asOf > todayInTz(ctx.org.timezone, ctx.now)) {
      throw new HttpError(400, 'validation_error', 'Choose today or an earlier date.', {
        asOf: 'Choose today or an earlier date.',
      })
    }
    const meter = usageFor(ctx.db, ctx.org, ctx.now).askQuestions
    if (meter.limit !== null && meter.used >= meter.limit) {
      throw new HttpError(
        403,
        'plan_limit_reached',
        `You’ve used all ${meter.limit} questions this month on the ${TIER_LABELS[ctx.org.tier]} plan. The count resets on the 1st.`,
      )
    }
    const thread = input.threadId ? threadFor(ctx, input.threadId) : null

    const result = answer(ctx, input.question, {
      route: input.route ?? null,
      asOf: input.asOf ?? null,
      context: input.context ?? null,
    })
    const at = ctx.now.toISOString()
    const t: MockAskThread = thread ?? {
      id: newId('thr'),
      orgId: ctx.org.id,
      userId: ctx.user.id,
      title: input.question.length > 80 ? `${input.question.slice(0, 77)}…` : input.question,
      createdAt: at,
      updatedAt: at,
    }
    if (!thread) ctx.db.askThreads.push(t)
    t.updatedAt = at
    const base = {
      orgId: ctx.org.id,
      userId: ctx.user.id,
      threadId: t.id,
      asOf: input.asOf ?? null,
      feedback: null,
    }
    const question: MockAskMessage = {
      ...base,
      id: newId('msg'),
      role: 'user',
      content: input.question,
      citations: [],
      route: null,
      grounded: true,
      suggestions: [],
      createdAt: at,
    }
    const reply: MockAskMessage = {
      ...base,
      id: newId('msg'),
      role: 'assistant',
      content: result.content,
      citations: result.citations,
      route: result.route,
      grounded: result.grounded,
      suggestions: result.suggestions,
      createdAt: new Date(ctx.now.getTime() + 1).toISOString(),
    }
    ctx.db.askMessages.push(question, reply)
    countQuestion(ctx)
    commit()

    const usage = usageFor(ctx.db, ctx.org, ctx.now).askQuestions
    const delay = tokenDelay()
    const failMidway = ctx.query.get('simulate') === 'stream_error'
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: AskStreamEvent) => controller.enqueue(encoder.encode(sse(e)))
        try {
          send({ event: 'route', data: { route: result.route } })
          const sent = new Set<number>()
          const tokens = tokenize(result.content)
          for (const [i, text] of tokens.entries()) {
            // Each citation arrives just before the first token that refers to it.
            for (const m of text.matchAll(/\[(\d+)\]/g)) {
              const n = Number(m[1])
              const c = result.citations.find((x) => x.n === n)
              if (c && !sent.has(n)) {
                sent.add(n)
                send({ event: 'citation', data: c })
              }
            }
            send({ event: 'token', data: { text } })
            if (failMidway && i === Math.floor(tokens.length / 2)) {
              send({
                event: 'error',
                data: {
                  code: 'internal_error',
                  message: 'The answer stopped part-way. Ask again.',
                },
              })
              controller.close()
              return
            }
            if (delay) await sleep(delay)
          }
          for (const c of result.citations) if (!sent.has(c.n)) send({ event: 'citation', data: c })
          send({
            event: 'done',
            data: {
              messageId: reply.id,
              threadId: t.id,
              userMessageId: question.id,
              grounded: result.grounded,
              suggestions: result.suggestions,
              usage,
            },
          })
        } catch {
          send({
            event: 'error',
            data: { code: 'internal_error', message: 'Something went wrong while answering.' },
          })
        }
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
      },
    })
  }),

  orgRoute('GET', '/ask/threads', { permission: 'ask.use', feature: 'ask.policy' }, (ctx) => {
    const mine = ctx.db.askThreads
      .filter((t) => t.orgId === ctx.org.id && t.userId === ctx.user.id)
      .map((t) => toThread(ctx, t))
    return json(paginate(mine, ctx.query, { defaultSort: '-updatedAt', search: (t) => [t.title] }))
  }),

  orgRoute('GET', '/ask/threads/:id', { permission: 'ask.use', feature: 'ask.policy' }, (ctx) => {
    const t = threadFor(ctx, ctx.params.id ?? '')
    const messages = ctx.db.askMessages
      .filter((m) => m.threadId === t.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toMessage)
    const body: AskThreadDetail = { ...toThread(ctx, t), messages }
    return json(body)
  }),

  orgRoute(
    'DELETE',
    '/ask/threads/:id',
    { permission: 'ask.use', feature: 'ask.policy' },
    (ctx) => {
      const t = threadFor(ctx, ctx.params.id ?? '')
      ctx.db.askThreads = ctx.db.askThreads.filter((x) => x.id !== t.id)
      ctx.db.askMessages = ctx.db.askMessages.filter((m) => m.threadId !== t.id)
      commit()
      return noContent()
    },
  ),

  orgRoute(
    'POST',
    '/ask/messages/:id/feedback',
    { permission: 'ask.use', feature: 'ask.policy' },
    async (ctx) => {
      const input = parse(askFeedbackSchema, await ctx.json())
      const m = ctx.db.askMessages.find(
        (x) =>
          x.id === ctx.params.id &&
          x.orgId === ctx.org.id &&
          x.userId === ctx.user.id &&
          x.role === 'assistant',
      )
      if (!m) throw notFound('Answer')
      m.feedback = { rating: input.rating, note: input.note || null, at: ctx.now.toISOString() }
      commit()
      return json(toMessage(m))
    },
  ),
]
