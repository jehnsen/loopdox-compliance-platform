'use client'

import { useParams } from 'next/navigation'
import { NotFoundState } from '@/components/states'

export default function OrgNotFound() {
  const { org } = useParams<{ org: string }>()
  return <NotFoundState homeHref={`/${org}`} />
}
