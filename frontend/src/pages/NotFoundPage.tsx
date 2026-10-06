import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        height:         "100dvh",
        gap:            "16px",
        color:          "var(--muted-foreground)",
      }}
    >
      <span style={{ fontSize: "4rem" }}>404</span>
      <p style={{ margin: 0 }}>Page not found.</p>
      <Link to="/" style={{ color: "var(--primary)" }}>Go to chat →</Link>
    </div>
  );
}