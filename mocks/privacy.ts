import type { DueState } from '@/lib/api/types'
import { dueStateOf } from '@/lib/privacy'
import { pad } from '@/lib/utils/ids'
import { todayInTz } from '@/lib/utils/dates'
import { isActiveStaffMember } from '@/mocks/helpers'
import { HttpError } from '@/mocks/http'
import type { OrgCtx } from '@/mocks/router'

/** Shared rules for the privacy handlers. */

/**
 * Auditor-only members see finalised privacy records only (spec 5.2: "read
 * (approved only)"): approved processing records, signed-off PIAs, closed DSRs and
 * incidents. Agreements, registrations and training records are always final.
 */
export function canSeePrivacy(ctx: OrgCtx, finalised: boolean): boolean {
  return ctx.can('privacy.read', finalised ? undefined : { status: 'draft' })
}

export function today(ctx: OrgCtx): string {
  return todayInTz(ctx.org.timezone, ctx.now)
}

export function dueState(
  ctx: OrgCtx,
  date: string,
  leadDays: number,
): { state: DueState; days: number } {
  return dueStateOf(date, leadDays, ctx.org.timezone, ctx.now)
}

/** Next "PA-007" style reference within the org. */
export function nextRef(refs: readonly string[], prefix: string, width = 3): string {
  let max = 0
  for (const r of refs) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(r)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${pad(max + 1, width)}`
}

/** Next "INC-2026-0004" style reference for the current year (tenant timezone). */
export function nextYearlyRef(ctx: OrgCtx, refs: readonly string[], prefix: 'DSR' | 'INC'): string {
  const year = today(ctx).slice(0, 4)
  let max = 0
  for (const r of refs) {
    const m = new RegExp(`^${prefix}-${year}-(\\d+)$`).exec(r)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}-${year}-${pad(max + 1, 4)}`
}

/** 400 on `field` unless `userId` is an active, non-auditor member. */
export function assertMember(ctx: OrgCtx, userId: string, field: string): void {
  if (!isActiveStaffMember(ctx, userId)) {
    throw new HttpError(400, 'validation_error', 'Choose a current member of this organisation.', {
      [field]: 'Choose a current member.',
    })
  }
}

export function unprocessable(message: string): HttpError {
  return new HttpError(422, 'unprocessable', message)
}
