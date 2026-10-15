const base = (org: string) => `/${org}/privacy`

function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const qs = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString()
  return qs ? `${path}?${qs}` : path
}

export const privacyPaths = {
  processing: (org: string) => `${base(org)}/processing`,
  processingNew: (org: string) => `${base(org)}/processing/new`,
  processingView: (org: string, id: string) => `${base(org)}/processing/${id}`,
  processingEdit: (org: string, id: string) => `${base(org)}/processing/${id}/edit`,

  pias: (org: string) => `${base(org)}/pia`,
  piaNew: (org: string, processingId?: string) =>
    withQuery(`${base(org)}/pia/new`, { processing: processingId }),
  piaView: (org: string, id: string, step?: number) =>
    withQuery(`${base(org)}/pia/${id}`, { step: step ? String(step) : null }),

  requests: (org: string) => `${base(org)}/requests`,
  requestNew: (org: string, processingId?: string) =>
    withQuery(`${base(org)}/requests/new`, { processing: processingId }),
  requestView: (org: string, id: string) => `${base(org)}/requests/${id}`,

  incidents: (org: string) => `${base(org)}/incidents`,
  incidentReport: (org: string) => `${base(org)}/incidents/report`,
  incidentView: (org: string, id: string) => `${base(org)}/incidents/${id}`,

  agreements: (org: string) => `${base(org)}/agreements`,
  agreementNew: (org: string, processingId?: string) =>
    withQuery(`${base(org)}/agreements/new`, { processing: processingId }),
  agreementView: (org: string, id: string) => `${base(org)}/agreements/${id}`,
  agreementEdit: (org: string, id: string) => `${base(org)}/agreements/${id}/edit`,

  registration: (org: string) => `${base(org)}/registration`,
  training: (org: string) => `${base(org)}/training`,
}
