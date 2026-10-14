import { describe, expect, it } from 'vitest'
import { safeNext } from '@/lib/utils/safe-next'

describe('safeNext', () => {
  it('keeps same-site relative paths', () => {
    expect(safeNext('/3rdloop/policies?status=draft')).toBe('/3rdloop/policies?status=draft')
  })
  it('rejects open redirects', () => {
    expect(safeNext('https://evil.example')).toBe('/select-org')
    expect(safeNext('//evil.example')).toBe('/select-org')
    expect(safeNext('/\\evil.example')).toBe('/select-org')
    expect(safeNext(null)).toBe('/select-org')
  })
})
