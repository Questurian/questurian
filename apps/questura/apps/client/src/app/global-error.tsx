'use client';

import { useEffect } from 'react';

import { reportBrowserError } from '@/lib/observability/reportBrowserError';

/**
 * The last page: shown when the root layout itself fails, so nothing from the
 * layout is here (no fonts, no global CSS, no navigation). It replaces the
 * whole document, which is why it renders its own <html> and <body>.
 *
 * Styled inline from the foundations palette
 * (app/styles/global/foundations.css): the warm ground, ink, a paper panel and
 * the blue accent, with a hairline rule instead of a frame. Inline because the
 * stylesheet is part of what may have failed to load.
 *
 * Reports in production (lib/observability/reportBrowserError.ts).
 */

const INK = '#1A1A1A';
const GROUND = '#F5F0E8';
const PAPER = '#EFE9DE';
const ACCENT = '#3B5BDB';
const MUTED = '#5C5A56';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportBrowserError(error, 'global-error');
  }, [error]);

  return (
    <html lang="en" style={{ colorScheme: 'light' }}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 20px',
          background: GROUND,
          color: INK,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        <main style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.72rem',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: ACCENT,
            }}
          >
            Questurian
          </p>
          <hr style={{ border: 0, borderTop: `1px solid ${ACCENT}`, width: 48, margin: '14px auto 22px' }} />
          <h1
            style={{
              margin: 0,
              fontFamily: '"Playfair Display", Georgia, serif',
              fontWeight: 500,
              fontSize: '1.6rem',
              lineHeight: 1.25,
            }}
          >
            Something went wrong
          </h1>
          <p style={{ margin: '12px 0 0', fontSize: '0.95rem', lineHeight: 1.65, color: MUTED }}>
            The page could not be shown. Please try again in a moment.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: '18px auto 0',
                display: 'inline-block',
                padding: '6px 10px',
                background: PAPER,
                fontSize: '0.75rem',
                color: MUTED,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              }}
            >
              Reference {error.digest}
            </p>
          ) : null}
          <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: 'pointer',
                border: 0,
                borderRadius: 4,
                padding: '12px 22px',
                background: ACCENT,
                color: GROUND,
                fontSize: '0.9rem',
                fontWeight: 500,
              }}
            >
              Try again
            </button>
            {/* A plain anchor on purpose: a full load, not the router that just failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                padding: '12px 22px',
                color: ACCENT,
                fontSize: '0.9rem',
                fontWeight: 500,
                textDecoration: 'underline',
                textUnderlineOffset: 4,
              }}
            >
              Go to the homepage
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
