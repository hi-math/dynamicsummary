import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dynamic Summary — Writing Research Platform',
  description: '학생 글쓰기 능력 향상 연구 플랫폼',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <body className="min-h-full bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
