// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Shown while isCheckingAuth is true (the brief moment on page load when we
// don't yet know if the user is logged in or not).
// It prevents protected routes from flashing the login page.
//
// ─────────────────────────────────────────────────────────────────────────────

export function LoadingScreen() {
    return (
      <div
        style={{
          display:        "flex",
          justifyContent: "center",
          alignItems:     "center",
          height:         "100vh",
          fontSize:       "1.2rem",
          color:          "#888",
        }}
      >
        Loading…
      </div>
    );
  }