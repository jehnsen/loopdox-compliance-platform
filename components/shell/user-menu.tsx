'use client'

import { useState } from 'react'
import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { authRequest } from '@/lib/api/client'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { en } from '@/lib/i18n/en'
import { initials } from '@/lib/utils/format'
import { useSession } from '@/components/providers/session-provider'
import { applyTheme, isThemePref, type ThemePref } from '@/components/shell/theme'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export async function signOut(reason?: 'idle'): Promise<void> {
  await authRequest('logout').catch(() => undefined)
  window.location.assign(reason ? `/login?reason=${reason}` : '/login')
}

export function UserMenu({ initialTheme }: { initialTheme: ThemePref }) {
  const { user, roles } = useSession()
  const [theme, setTheme] = useState<ThemePref>(initialTheme)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent hover:ring-2 hover:ring-line"
        aria-label={`${en.shell.userMenu}: ${user.name}`}
        data-testid="user-menu"
      >
        {initials(user.name)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex flex-col px-2 py-1.5">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-sm text-muted">{user.email}</span>
          <span className="mt-1 text-xs text-muted" data-testid="user-roles">
            {roles.map((r) => ROLE_LABELS[r]).join(' · ')}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{en.shell.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => {
            if (!isThemePref(v)) return
            setTheme(v)
            applyTheme(v)
          }}
        >
          <DropdownMenuRadioItem value="light">
            <SunIcon /> {en.shell.themeLight}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon /> {en.shell.themeDark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon /> {en.shell.themeSystem}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOutIcon /> {en.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
