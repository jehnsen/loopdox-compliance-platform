export type PolicyTab = 'page' | 'history' | 'acknowledgements' | 'controls' | 'activity'

export const policyPaths = {
  library: (org: string) => `/${org}/policies`,
  new: (org: string, parentId?: string | null) =>
    `/${org}/policies/new${parentId ? `?parent=${encodeURIComponent(parentId)}` : ''}`,
  view: (org: string, id: string, tab?: PolicyTab, extra?: Record<string, string>) => {
    const qs = new URLSearchParams({
      ...(tab && tab !== 'page' ? { tab } : {}),
      ...extra,
    }).toString()
    return `/${org}/policies/${id}${qs ? `?${qs}` : ''}`
  },
  edit: (org: string, id: string) => `/${org}/policies/${id}/edit`,
  version: (org: string, id: string, v: number) => `/${org}/policies/${id}/versions/${v}`,
  mine: (org: string) => `/${org}/my-policies`,
}
