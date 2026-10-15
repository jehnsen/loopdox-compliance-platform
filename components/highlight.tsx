import { Fragment } from 'react'

const MARK = 'rounded-sm bg-warn-soft px-0.5 text-fg'

/** Renders the search API's "«match»" markers as <mark>. The text is never treated as HTML. */
export function Highlighted({ text }: { text: string }) {
  const parts = text.split(/«|»/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={MARK}>
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Marks every occurrence of the query's words in a plain string (IDs and titles). */
export function HighlightTerms({ text, query }: { text: string; query: string }) {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))]
  if (!terms.length) return <>{text}</>
  const re = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi')
  const lower = new Set(terms.map((t) => t.toLowerCase()))
  return (
    <>
      {text.split(re).map((part, i) =>
        lower.has(part.toLowerCase()) ? (
          <mark key={i} className={MARK}>
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
