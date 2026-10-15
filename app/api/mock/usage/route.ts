import { formatInTimeZone } from 'date-fns-tz'
import { NextResponse, type NextRequest } from 'next/server'
import { serverEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Test-only: sets this month's Ask question count for an org, so the Starter cap can
 * be tested without asking 100 questions. Exists only when API_MODE=mock and
 * MOCK_ALLOW_RESET=1; otherwise 404.
 */
export async function POST(req: NextRequest) {
  if (serverEnv.apiMode !== 'mock' || process.env.MOCK_ALLOW_RESET !== '1') {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Not found.' } },
      { status: 404 },
    )
  }
  const body = (await req.json().catch(() => null)) as {
    org?: string
    askQuestions?: number
  } | null
  const { getDb, commit } = await import('@/mocks/store')
  const db = getDb()
  const org = db.orgs.find((o) => o.slug === body?.org)
  if (!org || typeof body?.askQuestions !== 'number') {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Send { org, askQuestions }.' } },
      { status: 400 },
    )
  }
  const month = formatInTimeZone(new Date(), org.timezone, 'yyyy-MM')
  const row = db.usage.find((u) => u.orgId === org.id && u.month === month)
  if (row) row.askQuestions = body.askQuestions
  else db.usage.push({ orgId: org.id, month, askQuestions: body.askQuestions })
  commit()
  return NextResponse.json({ org: org.slug, month, askQuestions: body.askQuestions })
}
