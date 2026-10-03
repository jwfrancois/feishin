"use client";
// Root error boundary — rendered when the app itself crashes (even the
// login screen). Keeps Feishin's dark shell and shows the real error so
// failures are diagnosable instead of a bare "Application error" page.
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Feishin crashed:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          font: "13.5px/1.6 ui-sans-serif, system-ui, sans-serif",
          background: "#141414",
          color: "#eaeaef",
          display: "flex",
          height: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ maxWidth: 560, textAlign: "center", padding: 24 }}>
          <img src="/feishin-icon.png" alt="Feishin" style={{ height: 56, width: 56, marginBottom: 16, opacity: 0.9 }} />
          <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: "#9a9aa5", marginBottom: 16 }}>
            The player hit an unexpected client-side error. You can retry — your server settings are kept.
          </p>
          <pre
            style={{
              textAlign: "left",
              maxHeight: 180,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#1f1f21",
              border: "1px solid #2e2e33",
              borderRadius: 6,
              padding: "10px 12px",
              fontSize: 12,
              color: "#c8c8d2",
              marginBottom: 20,
            }}
          >
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ""}
          </pre>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#3774fc",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "9px 22px",
              fontSize: 13.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </body>
    </html>
  );
}
