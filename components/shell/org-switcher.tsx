'use client'

import { useRouter } from 'next/navigation'
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { TIER_LABELS } from '@/lib/entitlements'
import { en } from '@/lib/i18n/en'
import { useSession } from '@/components/providers/session-provider'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function OrgSwitcher() {
  const { org, memberships } = useSession()
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 max-w-[14rem] min-w-0 items-center gap-2 rounded-md px-2 text-base font-medium hover:bg-surface-2"
        aria-label={`${en.shell.switchOrg}. Current: ${org.name}`}
        data-testid="org-switcher"
      >
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-semibold text-accent ring-1 ring-accent/15 ring-inset"
        >
          {org.name.slice(0, 1)}
        </span>
        <span className="truncate">{org.name}</span>
        <ChevronsUpDownIcon className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{en.shell.switchOrg}</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.org.id}
            onSelect={() => {
              if (m.org.slug !== org.slug) router.push(`/${m.org.slug}`)
            }}
            className="items-start"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-fg">{m.org.name}</span>
              <span className="truncate text-xs text-muted">
                {TIER_LABELS[m.org.tier]} · {m.roles.map((r) => ROLE_LABELS[r]).join(', ')}
              </span>
            </div>
            {m.org.slug === org.slug ? (
              <CheckIcon className="mt-0.5 text-accent!" aria-label="Current" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
