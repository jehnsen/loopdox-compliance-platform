'use client'

import { useEffect, useMemo, useState } from 'react'
import { extractToc } from '@/lib/markdown/toc'
import { cn } from '@/lib/utils/cn'

/** 0–100: how far the reader has scrolled through the element. */
function useReadingProgress(targetId: string | undefined): number | null {
  const [progress, setProgress] = useState<number | null>(null)
  useEffect(() => {
    if (!targetId) return
    const el = document.getElementById(targetId)
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = el.getBoundingClientRect()
      const span = rect.height - window.innerHeight * 0.6
      const read = span > 0 ? (window.innerHeight * 0.4 - rect.top) / span : 1
      setProgress(Math.round(Math.min(1, Math.max(0, read)) * 100))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [targetId])
  return progress
}

/** Sticky "On this page" list; highlights the section in view and shows reading progress. */
export function TableOfContents({
  markdown,
  progressTargetId,
}: {
  markdown: string
  /** Element whose scroll progress the header bar reflects. */
  progressTargetId?: string
}) {
  const entries = useMemo(() => extractToc(markdown), [markdown])
  const [active, setActive] = useState<string | null>(null)
  const progress = useReadingProgress(progressTargetId)

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
    <nav aria-labelledby="toc-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="toc-heading" className="label-caps">
            On this page
          </h2>
          {progress !== null ? (
            <span className="text-2xs text-muted tabular-nums" aria-hidden="true">
              {progress}%
            </span>
          ) : null}
        </div>
        {progress !== null ? (
          <span aria-hidden="true" className="block h-0.5 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full origin-left rounded-full bg-accent transition-transform duration-150 ease-out"
              style={{ transform: `scaleX(${progress / 100})` }}
            />
          </span>
        ) : null}
      </div>
      <ol className="flex flex-col border-l border-line text-sm">
        {entries.map((e) => (
          <li key={e.id}>
            <a
              href={`#${e.id}`}
              aria-current={active === e.id ? 'location' : undefined}
              className={cn(
                '-ml-px block border-l-2 border-transparent py-1.5 leading-5 text-muted transition-colors duration-150 hover:border-line-strong hover:text-fg',
                e.level === 2 ? 'pl-3.5' : 'pl-7',
                active === e.id &&
                  'border-accent font-medium text-accent hover:border-accent hover:text-accent',
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
