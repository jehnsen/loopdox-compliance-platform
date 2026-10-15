const base = (org: string) => `/${org}/security`

export const securityPaths = {
  systems: (org: string) => `${base(org)}/assets`,
  systemNew: (org: string) => `${base(org)}/assets/new`,
  systemView: (org: string, id: string) => `${base(org)}/assets/${id}`,
  systemEdit: (org: string, id: string) => `${base(org)}/assets/${id}/edit`,

  access: (org: string, params?: { system?: string; person?: string }) => {
    const qs = new URLSearchParams(
      Object.entries(params ?? {}).filter((e): e is [string, string] => Boolean(e[1])),
    ).toString()
    return `${base(org)}/access${qs ? `?${qs}` : ''}`
  },

  reviews: (org: string) => `${base(org)}/access-reviews`,
  reviewNew: (org: string) => `${base(org)}/access-reviews/new`,
  reviewView: (org: string, id: string) => `${base(org)}/access-reviews/${id}`,

  secrets: (org: string) => `${base(org)}/secrets`,
  changes: (org: string) => `${base(org)}/changes`,

  risks: (org: string) => `${base(org)}/risks`,
  riskNew: (org: string) => `${base(org)}/risks/new`,
  riskView: (org: string, id: string) => `${base(org)}/risks/${id}`,
  riskEdit: (org: string, id: string) => `${base(org)}/risks/${id}/edit`,

  decisions: (org: string) => `${base(org)}/decisions`,
  decisionNew: (org: string, supersedes?: string) =>
    `${base(org)}/decisions/new${supersedes ? `?supersedes=${encodeURIComponent(supersedes)}` : ''}`,
  decisionView: (org: string, id: string) => `${base(org)}/decisions/${id}`,
  decisionEdit: (org: string, id: string) => `${base(org)}/decisions/${id}/edit`,

  control: (org: string, id: string) => `/${org}/evidence/controls/${id}`,
}
