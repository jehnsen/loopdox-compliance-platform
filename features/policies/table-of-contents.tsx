'use client'

import { useEffect, useMemo, useState } from 'react'
import { extractToc } from '@/lib/markdown/toc'
import { cn } from '@/lib/utils/cn'

/** Sticky "On this page" list; highlights the section in view. */
export function TableOfContents({ markdown }: { markdown: string }) {
  const entries = useMemo(() => extractToc(markdown), [markdown])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (!entries.length || typeof IntersectionObserver === 'undefined') return
    const headings = entries
      .map((e) => document.getElementById(e.id))
      .filter((el): el is HTMLElement => Boolean(el))
    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-72px 0px -70% 0px' },
    )
    for (const h of headings) observer.observe(h)
    return () => observer.disconnect()
  }, [entries])

  if (entries.length < 2) return null
  return (
    <nav aria-labelledby="toc-heading" className="flex flex-col gap-2">
      <h2 id="toc-heading" className="label-caps">
        On this page
      </h2>
      <ol className="flex flex-col border-l border-line text-sm">
        {entries.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              aria-current={active === e.id ? 'location' : undefined}
              className={cn(
                '-ml-px block border-l-2 border-transparent py-1 text-muted hover:text-fg',
                e.level === 2 ? 'pl-3' : 'pl-6',
                active === e.id && 'border-accent font-medium text-fg',
              )}
            >
              {e.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}
