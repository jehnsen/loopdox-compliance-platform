'use client'

import type { Classification } from '@/lib/api/types'
import { useSession } from '@/components/providers/session-provider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const ORDER: Classification[] = ['public', 'internal', 'confidential', 'restricted']

/** Data classification, using the org's own labels. */
export function ClassificationSelect({
  value,
  onChange,
  id,
  ...aria
}: {
  value: Classification
  onChange: (v: Classification) => void
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const labels = useSession().org.settings.classificationLabels
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Classification)}>
      <SelectTrigger id={id} {...aria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ORDER.map((c) => (
          <SelectItem key={c} value={c}>
            {labels[c]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function useClassificationLabel(): (c: Classification) => string {
  const labels = useSession().org.settings.classificationLabels
  return (c) => labels[c]
}
