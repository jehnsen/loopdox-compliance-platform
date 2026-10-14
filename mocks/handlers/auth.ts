import {
  acceptInviteSchema,
  forgotPasswordSchema,
  loginSchema,
  mockLoginSchema,
  refreshSchema,
  resetPasswordSchema,
} from '@/lib/schemas/auth'
import type { InvitePreview } from '@/lib/api/types'
import { issueMockTokens, refreshMockTokens } from '@/mocks/auth'
import { apiError, json, noContent, notFound, parse, HttpError } from '@/mocks/http'
import { publicRoute, userRoute, type RouteDef } from '@/mocks/router'
import { commit, newId } from '@/mocks/store'

export const authRoutes: RouteDef[] = [
  publicRoute('POST', '/auth/login', async (ctx) => {
    const { email, password } = parse(loginSchema, await ctx.json())
    const user = ctx.db.users.find((u) => u.email === email)
    if (!user || user.password !== password) {
      return apiError(401, 'invalid_credentials', 'That email and password don’t match an account.')
    }
    return json(await issueMockTokens(user.id))
  }),

  // Mock-only convenience for the "Sign in as…" list. Not part of the FastAPI contract.
  publicRoute('POST', '/auth/mock-login', async (ctx) => {
    const { email } = parse(mockLoginSchema, await ctx.json())
    const user = ctx.db.users.find((u) => u.email === email)
    if (!user) throw notFound('User')
    return json(await issueMockTokens(user.id))
  }),

  publicRoute('POST', '/auth/refresh', async (ctx) => {
    const { refreshToken } = parse(refreshSchema, await ctx.json())
    const pair = await refreshMockTokens(refreshToken)
    if (!pair) return apiError(401, 'unauthenticated', 'Your session has ended. Sign in again.')
    return json(pair)
  }),

  userRoute('POST', '/auth/logout', () => noContent()),

  publicRoute('POST', '/auth/forgot-password', async (ctx) => {
    const { email } = parse(forgotPasswordSchema, await ctx.json())
    const user = ctx.db.users.find((u) => u.email === email)
    if (user) {
      ctx.db.resetTokens.push({
        token: newId('rst'),
        userId: user.id,
        expiresAt: new Date(ctx.now.getTime() + 3_600_000).toISOString(),
      })
      commit()
    }
    // Same response whether or not the account exists.
    return new Response(null, { status: 202 })
  }),

  publicRoute('POST', '/auth/reset-password', async (ctx) => {
    const { token, password } = parse(resetPasswordSchema, await ctx.json())
    // Mock: the token "demo-reset-token" always works so the page can be tried.
    const entry =
      ctx.db.resetTokens.find(
        (t) => t.token === token && Date.parse(t.expiresAt) > ctx.now.getTime(),
      ) ?? (token === 'demo-reset-token' ? { userId: 'usr_staff', token } : null)
    if (!entry) {
      throw new HttpError(422, 'invalid_token', 'This reset link has expired or was already used.')
    }
    const user = ctx.db.users.find((u) => u.id === entry.userId)
    if (user) user.password = password
    ctx.db.resetTokens = ctx.db.resetTokens.filter((t) => t.token !== token)
    commit()
    return noContent()
  }),

  publicRoute('GET', '/auth/invites/:token', (ctx) => {
    const invite = ctx.db.invites.find((i) => i.token === ctx.params.token)
    if (!invite || invite.acceptedAt || Date.parse(invite.expiresAt) < ctx.now.getTime()) {
      throw new HttpError(404, 'not_found', 'This invite has expired or was already used.')
    }
    const org = ctx.db.orgs.find((o) => o.id === invite.orgId)
    const inviter = ctx.db.users.find((u) => u.id === invite.invitedBy)
    const body: InvitePreview = {
      token: invite.token,
      orgName: org?.name ?? 'your organisation',
      email: invite.email,
      roles: invite.roles,
      invitedBy: inviter?.name ?? 'An administrator',
      expiresAt: invite.expiresAt,
    }
    return json(body)
  }),

  publicRoute('POST', '/auth/invites/:token/accept', async (ctx) => {
    const { name, password } = parse(acceptInviteSchema, await ctx.json())
    const invite = ctx.db.invites.find((i) => i.token === ctx.params.token)
    if (!invite || invite.acceptedAt || Date.parse(invite.expiresAt) < ctx.now.getTime()) {
      throw new HttpError(404, 'not_found', 'This invite has expired or was already used.')
    }
    let user = ctx.db.users.find((u) => u.email === invite.email)
    if (!user) {
      user = { id: newId('usr'), name, email: invite.email, title: null, password }
      ctx.db.users.push(user)
    }
    const now = ctx.now.toISOString()
    const existing = ctx.db.memberships.find(
      (m) => m.orgId === invite.orgId && m.userId === user.id,
    )
    if (existing) {
      existing.status = 'active'
      existing.joinedAt = now
    } else {
      ctx.db.memberships.push({
        id: newId('mem'),
        orgId: invite.orgId,
        userId: user.id,
        roles: invite.roles,
        status: 'active',
        expiresAt: null,
        invitedAt: now,
        joinedAt: now,
        version: 1,
      })
    }
    invite.acceptedAt = now
    commit()
    return json(await issueMockTokens(user.id))
  }),
]
