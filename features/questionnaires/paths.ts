export const questionnairePaths = {
  list: (org: string) => `/${org}/questionnaires`,
  upload: (org: string) => `/${org}/questionnaires/upload`,
  view: (org: string, id: string) => `/${org}/questionnaires/${id}`,
}
