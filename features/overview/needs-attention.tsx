'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  CheckCircle2Icon,
  FileClockIcon,
  GavelIcon,
  HandshakeIcon,
  KeyRoundIcon,
  PlugZapIcon,
  ShieldCheckIcon,
  SirenIcon,
  UserRoundSearchIcon,
  type LucideIcon,
} from 'lucide-react'
import type { AttentionItem, AttentionKind, OverviewResponse } from '@/lib/api/types'
import { ATTENTION_LABELS } from '@/lib/overview'
import { cn } from '@/lib/utils/cn'
import { useSession } from '@/components/providers/session-provider'
import { CountdownInline } from '@/components/countdown-clock'
import { IdChip } from '@/components/chips'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const ICONS: Record<AttentionKind, LucideIcon> = {
  breach_deadline: SirenIcon,
  dsr_due: UserRoundSearchIcon,
  policy_approval: GavelIcon,
  review_overdue: FileClockIcon,
  secret_rotation: KeyRoundIcon,
  access_review: ShieldCheckIcon,
  connector_failing: PlugZapIcon,
  agreement_renewal: HandshakeIcon,
}

/** Items shown before "Show all". */
const COLLAPSED = 8

function Item({ item }: { item: AttentionItem }) {
  const { org } = useSession()
  const Icon = ICONS[item.kind]
  const label = ATTENTION_LABELS[item.kind].one
  return (
    <li>
      <Link
        href={item.href}
        data-testid="attention-item"
        data-kind={item.kind}
        data-tone={item.tone}
        className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
            item.tone === 'bad' ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn',
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {item.ref ? <IdChip>{item.ref}</IdChip> : null}
            <span className="font-medium">{item.title}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted">
            <span className="sr-only">{label}: </span>
            {item.deadline ? (
              <>
                <CountdownInline deadline={item.deadline} timezone={org.timezone} />
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span className={cn(item.tone === 'bad' && !item.deadline && 'font-medium text-bad')}>
              {item.detail}
            </span>
          </span>
        </span>
        {item.badge ? (
          <span className="mt-0.5 shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
            {item.badge}
          </span>
        ) : null}
      </Link>
    </li>
  )
}

/** Ranked list of what needs doing; every row links to its record. */
export function NeedsAttention({ attention }: { attention: OverviewResponse['attention'] }) {
  const [all, setAll] = useState(false)
  const shown = all ? attention.items : attention.items.slice(0, COLLAPSED)
  const kinds = Object.entries(attention.counts) as [AttentionKind, number][]
  return (
    <Card data-testid="needs-attention">
      <CardHeader>
        <div>
          <CardTitle>Needs attention</CardTitle>
          <CardDescription>
            {attention.total
              ? `${attention.total} ${attention.total === 1 ? 'item' : 'items'}, most urgent first.`
              : 'Nothing is due or overdue.'}
          </CardDescription>
        </div>
        {attention.total ? (
          <span
            data-testid="attention-total"
            className="flex h-6 min-w-6 items-center justify-center rounded-full bg-bad px-2 text-xs font-semibold text-surface tabular-nums"
          >
            {attention.total}
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-0 pb-0">
        {kinds.length ? (
          <ul className="flex flex-wrap gap-1.5 px-4" aria-label="Counts by type">
            {kinds.map(([kind, n]) => (
              <li
                key={kind}
                data-testid={`attention-count-${kind}`}
                className="rounded-full border border-line px-2 py-0.5 text-xs text-muted"
              >
                <span className="font-semibold text-fg tabular-nums">{n}</span>{' '}
                {ATTENTION_LABELS[kind][n === 1 ? 'one' : 'many'].toLowerCase()}
              </li>
            ))}
          </ul>
        ) : null}
        {attention.items.length ? (
          <ol className="divide-y divide-line border-t border-line" aria-label="Needs attention">
            {shown.map((item) => (
              <Item key={item.id} item={item} />
            ))}
          </ol>
        ) : (
          <div className="flex items-center gap-2 px-4 pb-4 text-base text-muted">
            <CheckCircle2Icon className="size-5 text-ok" aria-hidden="true" />
            You’re all caught up: no breach clocks, requests, approvals or reviews need you today.
          </div>
        )}
        {attention.items.length > COLLAPSED ? (
          <div className="border-t border-line px-4 py-2">
            <Button variant="link" size="sm" onClick={() => setAll((v) => !v)}>
              {all ? 'Show fewer' : `Show all ${attention.items.length}`}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
