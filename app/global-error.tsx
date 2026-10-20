"use client";
// Last-resort error page if even the root layout fails. It replaces the whole document,
// so it carries its own minimal styles (light and dark).

export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 16,
        }}
      >
        <title>Something went wrong · Syllabuddy</title>
        <style>{`
          body { background: #f8fafc; color: #0f172a; }
          a, button { color: #4338ca; }
          @media (prefers-color-scheme: dark) {
            body { background: #0b1120; color: #f1f5f9; }
            a, button { color: #a5b4fc; }
          }
          button, a { font: inherit; font-weight: 600; background: none; border: 2px solid currentColor;
            border-radius: 999px; padding: 10px 20px; cursor: pointer; text-decoration: none; margin: 6px; display: inline-block; }
          :focus-visible { outline: 3px solid currentColor; outline-offset: 2px; }
        `}</style>
        <main>
          <h1 style={{ fontSize: 28 }}>Oops — Syllabuddy hit a snag</h1>
          <p>Your plan is still saved in this browser. Please try again.</p>
          <button type="button" onClick={() => retry()}>
            Try again
          </button>
          {/* A plain link on purpose: the app's router may be what broke. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/">Go to the start page</a>
        </main>
      </body>
    </html>
  );
}
