/** Product name. Temporary; renaming the product is a one-line change here (or via env). */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'LoopDox'

export const DEFAULT_TIMEZONE = 'Asia/Manila'
export const DEFAULT_CURRENCY = 'PHP'
export const DEFAULT_LOCALE = 'en-PH'

/** Minutes of inactivity before the "Still there?" dialog. */
export const IDLE_TIMEOUT_MINUTES = 30
/** Seconds the "Still there?" dialog waits before signing out. */
export const IDLE_GRACE_SECONDS = 60

export const THEME_COOKIE = 'loopdox_theme'
export const DENSITY_COOKIE = 'loopdox_density'
