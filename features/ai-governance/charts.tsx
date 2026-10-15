'use client'

import { useEffect, useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Small hand-built SVG charts for the proxy statistics. One series each, so there is no
 * legend: the title names it. Marks follow the data-viz specs: a 2px line, a 10% area
 * wash, a 2px surface ring on the end dot, hairline grid, text in text tokens.
 */

export interface Point {
  /** "2026-10-14" */
  date: string
  value: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "14 Oct" */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number) as [number, number, number]
  return `${d} ${MONTHS[m - 1]}`
}

/** "1.2K", "3.4M"; whole numbers below a thousand. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${+(n / 1000).toFixed(1)}K`
  return String(Math.round(n * 10) / 10)
}

/** A round number at or above `max`, for the top of the axis. */
function niceMax(max: number): number {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= max) return step * pow
  return 10 * pow
}

/** The element's width, kept current. 0 until it has been measured. */
function useElementWidth(): [(el: HTMLElement | null) => void, number] {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return [setEl, width]
}

const HEIGHT = 150
const M = { top: 10, right: 12, bottom: 22, left: 40 }

export function TimeSeriesChart({
  title,
  points,
  formatValue,
  formatTick = compact,
  isFetching,
  className,
}: {
  title: string
  points: Point[]
  /** Full value, for the tooltip and the end label. */
  formatValue: (n: number) => string
  /** Short value, for the axis. */
  formatTick?: (n: number) => string
  isFetching?: boolean
  className?: string
}) {
  const [ref, width] = useElementWidth()
  const [active, setActive] = useState<number | null>(null)
  const id = useId()
  const n = points.length
  const plotW = Math.max(0, width - M.left - M.right)
  const plotH = HEIGHT - M.top - M.bottom
  const top = niceMax(Math.max(0, ...points.map((p) => p.value)))
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const y = (v: number) => M.top + plotH - (v / top) * plotH
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join('')
  const area = n ? `${line}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ''
  const last = points[n - 1]
  const at = active !== null ? points[active] : undefined

  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left - M.left
    return Math.min(n - 1, Math.max(0, Math.round((px / Math.max(1, plotW)) * (n - 1))))
  }
  const onMove = (e: PointerEvent<SVGElement>) => {
    if (n) setActive(nearest(e.clientX, e.currentTarget.getBoundingClientRect()))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!n) return
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step) {
      e.preventDefault()
      setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (step > 0 ? -1 : n)) + step)))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(n - 1)
    } else if (e.key === 'Escape') setActive(null)
  }

  const ticks = [0, top / 2, top]
  const xTicks = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : n ? [0] : []
  const summary = n
    ? `${title}: ${formatValue(last?.value ?? 0)} on ${shortDate(last?.date ?? '')}, from ${shortDate(points[0]?.date ?? '')}. Highest ${formatValue(Math.max(...points.map((p) => p.value)))}.`
    : `${title}: no data.`

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="group"
      aria-label={`${title}. ${summary} Use the arrow keys to read each day.`}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
      data-testid="time-series"
      className={cn(
        'relative rounded-md outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent',
        isFetching && 'opacity-70',
        className,
      )}
      style={{ height: HEIGHT }}
    >
      {width > 0 ? (
        <svg
          width={width}
          height={HEIGHT}
          className="block overflow-visible"
          aria-hidden="true"
          onPointerMove={onMove}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={M.left - 8}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--muted)"
              >
                {formatTick(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i, k) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 4}
              textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
              fontSize={11}
              fill="var(--muted)"
            >
              {shortDate(points[i]?.date ?? '')}
            </text>
          ))}
          <path d={area} fill="var(--viz-1)" fillOpacity={0.1} />
          <path
            d={line}
            fill="none"
            stroke="var(--viz-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {last && active === null ? (
            <>
              <circle
                cx={x(n - 1)}
                cy={y(last.value)}
                r={5}
                fill="var(--viz-1)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
              <text
                x={x(n - 1)}
                y={y(last.value) - 12}
                textAnchor="end"
                fontSize={12}
                fontWeight={600}
                fill="var(--fg)"
              >
                {formatValue(last.value)}
              </text>
            </>
          ) : null}
          {at ? (
            <>
              <line
                x1={x(active ?? 0)}
                x2={x(active ?? 0)}
                y1={M.top}
                y2={y(0)}
                stroke="var(--muted)"
                strokeWidth={1}
              />
              <circle
                cx={x(active ?? 0)}
                cy={y(at.value)}
                r={5}
                fill="var(--viz-1)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            </>
          ) : null}
          {/* The pointer layer is the whole plot, much bigger than the line. */}
          <rect
            x={M.left}
            y={0}
            width={plotW}
            height={HEIGHT - M.bottom}
            fill="transparent"
            onPointerMove={onMove}
          />
        </svg>
      ) : null}
      {at ? (
        <div
          role="presentation"
          className="pointer-events-none absolute top-0 z-10 flex min-w-32 flex-col gap-0.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm shadow-pop"
          style={{
            left: Math.min(Math.max(x(active ?? 0) + 12, 0), Math.max(0, width - 150)),
          }}
        >
          <span className="text-xs text-muted">{shortDate(at.date)}</span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-viz-1" />
            <span className="font-semibold tabular-nums">{formatValue(at.value)}</span>
            <span className="text-xs text-muted">{title}</span>
          </span>
        </div>
      ) : null}
      <span id={`${id}-live`} className="sr-only" aria-live="polite">
        {at ? `${shortDate(at.date)}: ${formatValue(at.value)}` : ''}
      </span>
    </div>
  )
}

/** A small trend line for a stat tile. The tile's number carries the value, so it is decorative. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const [ref, width] = useElementWidth()
  const h = 32
  const pad = 5
  const max = Math.max(1, ...values)
  const min = Math.min(...values, max)
  const span = Math.max(1, max - min)
  const px = (i: number) =>
    pad + (values.length > 1 ? (i / (values.length - 1)) * (width - 2 * pad) : 0)
  const py = (v: number) => pad + (h - 2 * pad) * (1 - (v - min) / span)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join('')
  const lastV = values[values.length - 1]
  return (
    <div ref={ref} className={cn('h-8 w-full', className)} aria-hidden="true">
      {width > 0 && values.length > 1 && lastV !== undefined ? (
        <svg width={width} height={h} className="block overflow-visible">
          <path
            d={d}
            fill="none"
            stroke="var(--viz-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={px(values.length - 1)}
            cy={py(lastV)}
            r={4}
            fill="var(--viz-1)"
            stroke="var(--surface)"
            strokeWidth={2}
          />
        </svg>
      ) : null}
    </div>
  )
}

export interface BarItem {
  label: string
  value: number
}

/** Horizontal bars for a ranked list: a 4px rounded tip, square at the baseline, the value at the tip. */
export function BarList({ items, label }: { items: BarItem[]; label: string }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul aria-label={label} className="flex flex-col gap-3" data-testid="bar-list">
      {items.map((item) => (
        <li key={item.label} className="flex flex-col gap-1">
          <span className="text-base">{item.label}</span>
          <span className="flex items-center gap-2">
            <span
              className="h-2.5 rounded-r-[4px] bg-viz-1"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                maxWidth: 'calc(100% - 3rem)',
              }}
            />
            <span className="text-sm font-semibold tabular-nums">
              {item.value.toLocaleString('en-PH')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
