'use client'

import { useState } from 'react'
import { LockIcon, MailIcon } from 'lucide-react'
import { FEATURE_INFO, minimumTierFor, TIER_LABELS, type Feature } from '@/lib/entitlements'
import { en } from '@/lib/i18n/en'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import { PremiumBadge } from '@/components/chips'

/** Shown in place of a feature the org's plan doesn't include. */
export function UpgradeCard({ feature, className }: { feature: Feature; className?: string }) {
  const info = FEATURE_INFO[feature]
  const tier = minimumTierFor(feature)
  const [contacted, setContacted] = useState(false)
  return (
    <section
      aria-labelledby={`upgrade-${feature}`}
      data-testid="upgrade-card"
      className={cn(
        'mx-auto flex max-w-xl flex-col gap-4 rounded-lg border border-line bg-surface p-6',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-md bg-surface-2 text-muted">
          <LockIcon className="size-4" aria-hidden="true" />
        </span>
        {tier === 'premium' ? (
          <PremiumBadge />
        ) : (
          <span className="label-caps">{TIER_LABELS[tier]}</span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 id={`upgrade-${feature}`} className="text-lg font-semibold">
          {info.title}
        </h2>
        <p className="text-base text-muted">{info.description}</p>
        <p className="text-base font-medium">{en.upgrade.includedIn(TIER_LABELS[tier])}</p>
      </div>
      {contacted ? (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-base">
          {en.upgrade.contactBody}
        </p>
      ) : (
        <div>
          <Button variant="primary" onClick={() => setContacted(true)}>
            <MailIcon aria-hidden="true" />
            {en.upgrade.contactUs}
          </Button>
        </div>
      )}
    </section>
  )
}
