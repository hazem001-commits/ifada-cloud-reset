// ============================================================
// src/app/layout.tsx
// ============================================================
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IFADA — أرشيف القضايا',
  description: 'تحقيق جنائي جماعي. لا أحد يقدر يحل القضية لحاله.',
};

export const viewport: Viewport = {
  themeColor: '#0c1116',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
