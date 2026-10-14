/** Only same-site relative paths are accepted as a post-login destination (no open redirects). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return '/select-org'
  }
  return next
}
