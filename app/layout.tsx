import { I18nProvider } from '@/components/I18nProvider'

export const metadata = {
  title: 'ResearchKit OS',
  description: 'AI Research Operating System — Multi-agent paper reading & knowledge management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  )
}
