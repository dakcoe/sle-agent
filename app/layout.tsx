import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SLE Agent — 사내 규정 탐색',
  description: 'AI 기반 사내 규정 탐색 에이전트',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <div className="bg-blobs" aria-hidden="true">
          <div className="blob blob-1" />
          <div className="blob blob-2" />
          <div className="blob blob-3" />
          <div className="blob blob-4" />
        </div>
        {children}
      </body>
    </html>
  );
}
