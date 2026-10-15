import { NextResponse, type NextRequest } from 'next/server'
import { serverEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Test-only: sets an org's VisorShield proxy status, so the degraded state can be seen
 * without a real outage. Exists only when API_MODE=mock and MOCK_ALLOW_RESET=1; otherwise 404.
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
    status?: 'healthy' | 'degraded'
  } | null
  const { getDb, commit } = await import('@/mocks/store')
  const db = getDb()
  const org = db.orgs.find((o) => o.slug === body?.org)
  const proxy = org ? db.aiProxy.find((p) => p.orgId === org.id) : undefined
  if (!org || !proxy || (body?.status !== 'healthy' && body?.status !== 'degraded')) {
    return NextResponse.json(
      { error: { code: 'validation_error', message: 'Send { org, status }.' } },
      { status: 400 },
    )
  }
  proxy.status = body.status
  if (body.status === 'degraded') {
    proxy.latencyP95Ms = 2350
    proxy.uptimePct = 98.6
    proxy.note = 'Responses are slow. VisorShield is retrying against the second region.'
  } else {
    proxy.latencyP95Ms = 410
    proxy.uptimePct = 99.97
    proxy.note = 'All checks passing.'
  }
  proxy.checkedAt = new Date().toISOString()
  commit()
  return NextResponse.json({ org: org.slug, status: proxy.status })
}
