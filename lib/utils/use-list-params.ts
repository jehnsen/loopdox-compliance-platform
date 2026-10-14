'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useMemo } from 'react'
import type { ListQuery } from '@/lib/api/types'

/**
 * List state (page, size, sort, search, filters, hidden columns) kept in the URL,
 * so every view of a table is a shareable, bookmarkable link.
 */
export interface ListParams {
  page: number
  pageSize: number
  /** "title" or "-updatedAt"; null = server default. */
  sort: string | null
  q: string
  filters: Record<string, string[]>
  /** Hidden column IDs. */
  hidden: string[]
}

export interface ListParamsOptions {
  filterKeys: readonly string[]
  defaultPageSize?: number
  /** Prefix for the URL keys when a page has more than one table. */
  prefix?: string
}

export const PAGE_SIZES = [10, 25, 50, 100] as const

export function useListParams({ filterKeys, defaultPageSize = 25, prefix = '' }: ListParamsOptions) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const k = useCallback((key: string) => `${prefix}${key}`, [prefix])

  const params = useMemo<ListParams>(() => {
    const filters: Record<string, string[]> = {}
    for (const key of filterKeys) {
      const v = searchParams.get(k(key))
      if (v) filters[key] = v.split(',').filter(Boolean)
    }
    const size = Number(searchParams.get(k('pageSize')))
    return {
      page: Math.max(1, Number(searchParams.get(k('page'))) || 1),
      pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : defaultPageSize,
      sort: searchParams.get(k('sort')),
      q: searchParams.get(k('q')) ?? '',
      filters,
      hidden: searchParams.get(k('hide'))?.split(',').filter(Boolean) ?? [],
    }
  }, [searchParams, filterKeys, defaultPageSize, k])

  /** Apply a partial update. Changing anything but the page resets to page 1. */
  const setParams = useCallback(
    (patch: Partial<ListParams>) => {
      const next = new URLSearchParams(searchParams.toString())
      const merged: ListParams = { ...params, ...patch, filters: { ...params.filters, ...patch.filters } }
      if (!('page' in patch)) merged.page = 1
      const put = (key: string, value: string | null) => {
        if (value) next.set(k(key), value)
        else next.delete(k(key))
      }
      put('page', merged.page > 1 ? String(merged.page) : null)
      put('pageSize', merged.pageSize !== defaultPageSize ? String(merged.pageSize) : null)
      put('sort', merged.sort)
      put('q', merged.q.trim() || null)
      put('hide', merged.hidden.length ? merged.hidden.join(',') : null)
      for (const key of filterKeys) put(key, merged.filters[key]?.length ? merged.filters[key].join(',') : null)
      const qs = next.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, params, filterKeys, defaultPageSize, pathname, router, k],
  )

  /** The API query for this state. */
  const query = useMemo<ListQuery>(() => {
    const q: ListQuery = { page: params.page, pageSize: params.pageSize }
    if (params.sort) q.sort = params.sort
    if (params.q) q.q = params.q
    for (const [key, values] of Object.entries(params.filters)) if (values.length) q[key] = values
    return q
  }, [params])

  const activeFilterCount = Object.values(params.filters).filter((v) => v.length).length + (params.q ? 1 : 0)

  return { params, setParams, query, activeFilterCount }
}
