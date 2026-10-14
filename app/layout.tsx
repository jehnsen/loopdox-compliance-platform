import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import type { ReactNode } from 'react'
import { APP_NAME } from '@/lib/config'
import { getUiPrefs } from '@/lib/server/session'
import { AppProviders } from '@/components/providers/app-providers'
import './globals.css'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Policies, privacy and security compliance for Philippine organisations.',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f9' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1220' },
  ],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { theme } = await getUiPrefs()
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  )
}
