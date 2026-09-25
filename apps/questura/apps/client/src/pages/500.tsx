import Head from 'next/head';

/**
 * What a reader gets when the server cannot render a page at all.
 *
 * The App Router's error pages (`app/error.tsx`, `app/global-error.tsx`) only
 * cover errors React can catch while rendering. A page rendered on demand into
 * the static cache (an article not prerendered at build, `dynamicParams`) that
 * fails, for example because the API answered 503, never reaches them: Next
 * answers the request itself with its `/500` page. Without this file that was
 * Next's built-in bare "500 | Internal Server Error" page, with no way
 * back (launch fix plan item 8, journey 10).
 *
 * Built once as static HTML, so it depends on nothing that may be down. The
 * App Router's stylesheet is not loaded here, so it is styled inline from the
 * foundations palette (app/styles/global/foundations.css), matching
 * global-error.tsx. The server has already logged the error; the page never
 * shows it.
 */

/**
 * No JavaScript at all. The page needs none (plain links), and Next's Pages
 * Router runtime, once loaded on an error page, keeps probing the failed
 * address (`HEAD /_next/data/…`), adding load to a page that already failed.
 * `amp: false` is the default; it is here because Next's page-config type
 * only accepts an object sharing a key with it, and it does not list the
 * (still honoured) `unstable_runtimeJS`.
 */
export const config = { amp: false, unstable_runtimeJS: false };

const INK = '#1A1A1A';
const GROUND = '#F5F0E8';
const ACCENT = '#3B5BDB';
const MUTED = '#5C5A56';

export default function ServerErrorPage() {
  return (
    <>
      <Head>
        <title>Something went wrong — Questurian</title>
        <meta name="robots" content="noindex" />
        <style>{`html,body{margin:0;background:${GROUND};color-scheme:light}`}</style>
      </Head>
      <div
        style={{
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
            This page could not be shown just now. Please try again in a moment.
          </p>
          <div style={{ marginTop: 28, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {/* An empty href is this same address: trying again is a reload. Plain anchors, so neither needs JavaScript. */}
            <a
              href=""
              style={{
                borderRadius: 4,
                padding: '12px 22px',
                background: ACCENT,
                color: GROUND,
                fontSize: '0.9rem',
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Try again
            </a>
            {/* A plain anchor on purpose: a full load, not a router on a page that failed. */}
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
      </div>
    </>
  );
}
