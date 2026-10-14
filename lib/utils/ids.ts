/** Display-ID helpers: ITD-006, DSR-2026-0012, INC-2026-0003, RISK-014, ADR-004. */

export function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

export function docId(prefix: string, n: number): string {
  return `${prefix}-${pad(n, 3)}`
}

export function yearlyRef(prefix: 'DSR' | 'INC', year: number, n: number): string {
  return `${prefix}-${year}-${pad(n, 4)}`
}

export function seqRef(prefix: 'RISK' | 'ADR', n: number): string {
  return `${prefix}-${pad(n, 3)}`
}

/** Next number in a sequence of refs that share a prefix: ["RISK-012", "RISK-003"] → 13. */
export function nextSeq(refs: readonly string[], prefix: string): number {
  let max = 0
  for (const ref of refs) {
    if (!ref.startsWith(`${prefix}-`)) continue
    const n = Number(
      ref
        .slice(prefix.length + 1)
        .split('-')
        .at(-1),
    )
    if (Number.isFinite(n) && n > max) max = n
  }
  return max + 1
}
