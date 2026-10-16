import type { ReactNode } from 'react'
import { BotIcon, FileCheck2Icon, ShieldCheckIcon, SirenIcon, type LucideIcon } from 'lucide-react'
import { APP_NAME } from '@/lib/config'
import { en } from '@/lib/i18n/en'
import { LogoMark } from '@/components/logo-mark'

const PILLARS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: FileCheck2Icon,
    title: 'Controlled policies',
    body: 'Versions, approvals and staff acknowledgements in one library.',
  },
  {
    icon: SirenIcon,
    title: 'Data Privacy Act of 2012',
    body: 'Processing records, impact assessments, requests and the 72-hour breach clock.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Security and evidence',
    body: 'Risk, access and change registers, with evidence ready for your auditor.',
  },
  {
    icon: BotIcon,
    title: 'AI governance',
    body: 'An AI inventory, assessments and prompt policies enforced through VisorShield.',
  },
]

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="auth-panel relative hidden flex-col justify-between overflow-hidden bg-nav px-12 py-10 text-nav-fg lg:flex">
        <span className="relative flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight text-nav-strong">{APP_NAME}</span>
        </span>
        <div className="relative flex max-w-lg flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-2xs font-semibold tracking-[0.12em] text-nav-accent uppercase">
              {en.app.descriptor}
            </p>
            <p className="text-2xl font-semibold tracking-tight text-balance text-nav-strong">
              Run compliance like a controlled system, not a shared drive.
            </p>
          </div>
          <ul className="flex flex-col gap-5">
            {PILLARS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-nav-line bg-nav-hover text-nav-accent"
                >
                  <p.icon className="size-4.5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium text-nav-strong">{p.title}</span>
                  <span className="text-sm text-nav-muted">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-nav-muted">
          Built for Philippine organisations · Every change is logged.
        </p>
      </aside>
      <div className="flex flex-col items-center justify-center gap-8 px-4 py-10 sm:px-8">
        <div className="flex flex-col items-center gap-2 text-center lg:hidden">
          <span className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
            <LogoMark />
            {APP_NAME}
          </span>
          <p className="text-sm text-muted">{en.app.tagline}</p>
        </div>
        <main id="main" className="w-full max-w-md">
          {children}
        </main>
      </div>
    </div>
  )
}
