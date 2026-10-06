// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Shown in the right panel when no conversation is open.
// Tells the user to pick or start a chat.
//
// ─────────────────────────────────────────────────────────────────────────────

export function EmptyState() {
    return (
      <div
        style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          justifyContent: "center",
          height:         "100%",
          gap:            "12px",
          color:          "var(--muted-foreground)",
        }}
      >
        <span style={{ fontSize: "3rem" }}>💬</span>
        <p style={{ margin: 0, fontSize: "1rem" }}>
          Choose a conversation to start chatting
        </p>
      </div>
    );
  }