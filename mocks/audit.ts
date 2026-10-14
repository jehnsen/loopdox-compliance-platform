import type { AuditEvent } from '@/lib/api/types'
import type { OrgCtx } from '@/mocks/router'
import { newId } from '@/mocks/store'

/** Append an audit event for the acting user. */
export function audit(
  ctx: OrgCtx,
  action: string,
  target: { type: string; id: string; label?: string | null },
  details: Record<string, unknown> = {},
): AuditEvent {
  const event: AuditEvent = {
    id: newId('aud'),
    orgId: ctx.org.id,
    actor: { id: ctx.user.id, name: ctx.user.name },
    action,
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label ?? null,
    at: ctx.now.toISOString(),
    ip: ctx.req.headers.get('x-forwarded-for') ?? '127.0.0.1',
    details,
  }
  ctx.db.auditEvents.push(event)
  return event
}
