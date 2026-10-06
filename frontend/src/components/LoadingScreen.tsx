// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Shown while isCheckingAuth is true (the brief moment on page load when we
// don't yet know if the user is logged in or not).
// It prevents protected routes from flashing the login page.
//
// ─────────────────────────────────────────────────────────────────────────────

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner ring */}
        <span className="size-10 rounded-full border-4 border-border border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground tracking-wide">Loading…</p>
      </div>
    </div>
  );
}