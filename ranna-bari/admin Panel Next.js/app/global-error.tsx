'use client';

/**
 * The last boundary.
 *
 * `app/(dash)/error.tsx` catches the pages, but a boundary never catches the
 * layout it lives under, and both layouts here do real work — the shell reads
 * the session and calls the backend, the root one loads three fonts. When one
 * of those throws there is nothing below to catch it, and Next falls back to
 * "A server error occurred" with a digest and no way to turn it back into an
 * error. This file is the difference between that and a name.
 *
 * It replaces the root layout entirely when it renders, so it carries its own
 * `<html>` and `<body>` and cannot use the panel's tokens — none of them are
 * defined at this point. Hence inline styles and the `Canvas`/`CanvasText`
 * system colours, which follow the OS theme without the boot script that did
 * not get to run.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dev = process.env.NODE_ENV !== 'production';

  const mono =
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

  return (
    <html lang="en" style={{ colorScheme: 'light dark' }}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: 'Canvas',
          color: 'CanvasText',
          font: '14px/1.6 system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 600 }}>
            The panel didn’t render.
          </h1>
          <p style={{ margin: '6px 0 0', opacity: 0.75 }}>
            This one is above the shell, so nothing on the page is usable. It is
            almost always the session, the backend, or the layout itself.
          </p>

          {dev && error.message ? (
            <pre
              style={{
                marginTop: 16,
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid rgba(128,128,128,0.35)',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                font: `12px/1.6 ${mono}`,
              }}
            >
              {error.message}
            </pre>
          ) : null}

          {dev && error.stack ? (
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, opacity: 0.75 }}>
                Stack
              </summary>
              <pre
                style={{
                  marginTop: 6,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid rgba(128,128,128,0.35)',
                  overflowX: 'auto',
                  opacity: 0.75,
                  font: `11.5px/1.6 ${mono}`,
                }}
              >
                {error.stack}
              </pre>
            </details>
          ) : null}

          {error.digest ? (
            <p style={{ marginTop: 12, fontSize: 11.5, opacity: 0.6 }}>
              Digest <span style={{ font: `11.5px ${mono}` }}>{error.digest}</span> — the
              same string is on the line the server logged for this render.
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '7px 13px',
              borderRadius: 8,
              border: '1px solid rgba(128,128,128,0.45)',
              background: 'transparent',
              color: 'inherit',
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
