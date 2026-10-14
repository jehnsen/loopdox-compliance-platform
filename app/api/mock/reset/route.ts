import { NextResponse } from 'next/server'
import { serverEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Test-only: reseeds the mock store. Exists only when API_MODE=mock and
 * MOCK_ALLOW_RESET=1 (set by the Playwright config); otherwise 404.
 */
export async function POST() {
  if (serverEnv.apiMode !== 'mock' || process.env.MOCK_ALLOW_RESET !== '1') {
    return NextResponse.json(
      { error: { code: 'not_found', message: 'Not found.' } },
      { status: 404 },
    )
  }
  const { resetDb } = await import('@/mocks/store')
  const db = resetDb(new Date())
  return NextResponse.json({ seededAt: db.meta.seededAt })
}
