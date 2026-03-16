import type { Metadata } from 'next';
import './globals.css';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'brittle',
  description: 'Personal notes, backed by GitHub.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen overflow-hidden bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
