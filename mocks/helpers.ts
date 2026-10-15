import type { BaseEntity, NotificationType, Permission } from '@/lib/api/types'
import { can } from '@/lib/auth/permissions'
import type { OrgCtx } from '@/mocks/router'
import { newId, type MockDB } from '@/mocks/store'

/** Helpers shared by the mock handlers. */

export function userName(db: MockDB, id: string | null): string {
  if (!id) return ''
  return db.users.find((u) => u.id === id)?.name ?? 'Former member'
}

/** Active, unexpired memberships of the caller's org. */
export function activeMembers(ctx: OrgCtx) {
  return ctx.db.memberships.filter(
    (m) =>
      m.orgId === ctx.org.id &&
      m.status === 'active' &&
      (!m.expiresAt || Date.parse(m.expiresAt) > ctx.now.getTime()),
  )
}

export function membersWith(ctx: OrgCtx, permission: Permission): string[] {
  return activeMembers(ctx)
    .filter((m) => can({ roles: m.roles }, permission))
    .map((m) => m.userId)
}

/** In-app notifications for each user, except the caller. */
export function notify(
  ctx: OrgCtx,
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
  href: string,
): void {
  for (const userId of new Set(userIds)) {
    if (userId === ctx.user.id) continue
    ctx.db.notifications.push({
      id: newId('ntf'),
      orgId: ctx.org.id,
      userId,
      type,
      title,
      body,
      href,
      at: ctx.now.toISOString(),
      readAt: null,
    })
  }
}

/** Bumps the concurrency counter and the updated stamp after a write. */
export function touch(ctx: OrgCtx, entity: BaseEntity): void {
  entity.version += 1
  entity.updatedAt = ctx.now.toISOString()
  entity.updatedBy = ctx.user.id
}

/** Base fields for a new entity created by the caller. */
export function baseFields(ctx: OrgCtx, prefix: string): BaseEntity {
  const at = ctx.now.toISOString()
  return {
    id: newId(prefix),
    orgId: ctx.org.id,
    createdAt: at,
    updatedAt: at,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
    version: 1,
  }
}

/** The owner must be an active, non-auditor member (400 on `field` otherwise). */
export function isActiveStaffMember(ctx: OrgCtx, userId: string): boolean {
  return activeMembers(ctx).some(
    (m) => m.userId === userId && !m.roles.every((r) => r === 'auditor'),
  )
}

export function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvResponse(filename: string, header: string[], rows: unknown[][]): Response {
  const csv = [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n')
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
}
