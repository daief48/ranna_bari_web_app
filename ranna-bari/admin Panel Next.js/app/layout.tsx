import type { Metadata } from 'next';
import { Fraunces, Inter, Noto_Sans_Bengali } from 'next/font/google';

import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-fraunces',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

/**
 * Neither Fraunces nor Inter draws a single Bengali glyph, so a Bengali
 * preview without this face falls back to whatever the OS happens to have —
 * a different voice on every machine, and tofu where there is nothing.
 */
const bengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-bengali',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'RannaBari Admin',
  description: 'Operator console for the RannaBari home-cook marketplace.',
  icons: {
    icon: '/favicon.png',
    apple: '/logo.png',
  },
};

/**
 * Set the theme before first paint.
 *
 * Without this the panel renders light, then flips to dark once React
 * hydrates — a white flash on every navigation for anyone working at night,
 * which is most of when an operations desk is busy.
 */
const THEME_BOOT = `
try {
  var t = localStorage.getItem('rb-admin-theme');
  if (t !== 'light' && t !== 'dark') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          A bare `<script>`, deliberately, and it stays that way.

          React 19 logs "Encountered a script tag while rendering React
          component" for this in development. The warning is about client
          renders, where a script tag genuinely does nothing; on the server
          render — the only one that matters here — it is emitted into the
          HTML and runs while the parser is still above `<body>`, which is
          the entire point.

          `next/script` with `strategy="beforeInteractive"` is the documented
          replacement and was tried. It does not work for this. It compiles to
          `(self.__next_s=self.__next_s||[]).push([0,{...}])`, which queues the
          code for Next's runtime to execute once the framework bundle has
          loaded — well after first paint. The white flash this exists to
          prevent came straight back.

          So: a dev-only console warning, in exchange for no flash on every
          navigation for anyone working at night. That is the right trade, and
          it is not worth "fixing" again.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className={`${fraunces.variable} ${inter.variable} ${bengali.variable}`}>
        {children}
      </body>
    </html>
  );
}
