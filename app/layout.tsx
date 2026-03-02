import type { Metadata, Viewport } from 'next'
import { Nunito } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { GoogleProvider } from '@/components/google-oauth-provider'
import { ColorThemeProvider } from '@/lib/color-theme'
import './globals.css'

const nunito = Nunito({ subsets: ['latin', 'latin-ext'], variable: '--font-nunito' })

export const metadata: Metadata = {
  title: 'ReVibe',
  description: '라이트너 박스 기반 간격 반복 플래시카드 앱',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png' }],
    apple: '/icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'ReVibe',
  },
}

export const viewport: Viewport = {
  themeColor: '#f5f0ff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${nunito.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <ColorThemeProvider>
            <GoogleProvider>
              {children}
            </GoogleProvider>
          </ColorThemeProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
