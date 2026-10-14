import { THEME_COOKIE } from '@/lib/config'

export type ThemePref = 'light' | 'dark' | 'system'

export function isThemePref(v: unknown): v is ThemePref {
  return v === 'light' || v === 'dark' || v === 'system'
}

/** Applies the theme immediately and remembers it in a (non-sensitive) cookie. */
export function applyTheme(theme: ThemePref): void {
  document.documentElement.dataset.theme = theme
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`
}
