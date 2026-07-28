"use client";

export interface GlobalErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * Last-resort document-level error boundary.
 *
 * Cannot import the design system, providers, animation libraries, or environment parsing.
 * Inline styles use the locked Warm Editorial palette so the page remains
 * readable if CSS or provider initialization failed.
 */
export default function GlobalError({ reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#FEFAF8",
          color: "#2B2426",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "40px 16px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "640px",
            border: "1px solid #E9DFE1",
            borderRadius: "12px",
            background: "#FFFFFF",
            padding: "24px",
          }}
        >
          <h1 style={{ margin: "0 0 12px", fontSize: "24px", lineHeight: 1.3 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 24px", color: "#6F6266", fontSize: "16px", lineHeight: 1.6 }}>
            UnseenPrompt could not recover from this error. Try again, or reload the page.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "44px",
              padding: "0 16px",
              border: "none",
              borderRadius: "8px",
              background: "#A64763",
              color: "#FFFFFF",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
