import type { System } from '@/lib/api/types'
import { SECRET_VALUE_FIELDS } from '@/lib/schemas/security'
import { userName } from '@/mocks/helpers'
import { HttpError } from '@/mocks/http'
import type { OrgCtx } from '@/mocks/router'

/** Shared lookups and rules for the security handlers. */

export function orgSystems(ctx: OrgCtx): System[] {
  return ctx.db.systems.filter((s) => s.orgId === ctx.org.id)
}

export function systemOf(ctx: OrgCtx, id: string | null): System | undefined {
  return id ? orgSystems(ctx).find((s) => s.id === id) : undefined
}

/** 400 on `field` unless the system exists in this organisation. */
export function assertSystem(ctx: OrgCtx, id: string | null, field: string): System {
  const system = systemOf(ctx, id)
  if (!system) {
    throw new HttpError(400, 'validation_error', 'Choose a system.', {
      [field]: 'That system doesn’t exist.',
    })
  }
  return system
}

export function personNameOf(
  ctx: OrgCtx,
  grant: { userId: string | null; externalName: string | null },
): string {
  return grant.externalName ?? userName(ctx.db, grant.userId)
}

/** Stable grouping key for a person: their user ID, or "ext:" plus the name. */
export function personKeyOf(grant: { userId: string | null; externalName: string | null }): string {
  return grant.userId ?? `ext:${(grant.externalName ?? '').toLowerCase()}`
}

/**
 * LoopDox stores where a secret lives, never its value. A body that carries a field
 * that looks like the value is refused rather than quietly dropped.
 */
export function rejectSecretValue(body: unknown): void {
  if (!body || typeof body !== 'object') return
  const field = SECRET_VALUE_FIELDS.find((f) => f in body)
  if (field) {
    throw new HttpError(400, 'validation_error', 'LoopDox never stores a secret’s value.', {
      [field]: 'LoopDox stores where a secret lives, never its value. Remove it from the request.',
    })
  }
}
