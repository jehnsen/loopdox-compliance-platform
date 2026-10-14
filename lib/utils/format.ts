import { DEFAULT_LOCALE } from '@/lib/config'

const peso = new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'currency', currency: 'PHP' })
const integer = new Intl.NumberFormat(DEFAULT_LOCALE)

/** "₱1,234.50" */
export function formatPhp(amount: number): string {
  return peso.format(amount)
}

export function formatNumber(n: number): string {
  return integer.format(n)
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`
}

/** "1 policy", "3 policies" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase()
}

/** Masks all but the last 4 characters: "•••• 4821". */
export function maskValue(value: string): string {
  return `•••• ${value.slice(-4)}`
}
