import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/providers/auth-provider';

export const metadata: Metadata = {
  title: {
    default: 'VOICEPILOT AI — AI voice agents for your business',
    template: '%s · VOICEPILOT AI',
  },
  description:
    'VOICEPILOT AI lets businesses build, test and manage AI voice agents with secure speech-to-text and AI conversations.',
  applicationName: 'VOICEPILOT AI',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B1220',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
