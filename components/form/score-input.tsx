'use client'

import type { Score } from '@/lib/api/types'
import { IMPACT_LABELS, LIKELIHOOD_LABELS, SCORES } from '@/lib/risk'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** 1–5 rating with plain labels ("3 · Possible"). */
export function ScoreInput({
  kind,
  value,
  onChange,
  id,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: {
  kind: 'likelihood' | 'impact'
  value: Score
  onChange: (v: Score) => void
  id?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const labels = kind === 'likelihood' ? LIKELIHOOD_LABELS : IMPACT_LABELS
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v) as Score)}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        className="w-full"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SCORES.map((s) => (
          <SelectItem key={s} value={String(s)}>
            {s} · {labels[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
