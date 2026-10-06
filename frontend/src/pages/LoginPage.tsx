import { useState, type FormEvent } from "react";
import { useNavigate, Link }        from "react-router-dom";
import { loginUser }                from "../api/auth.api";
import { useAuthStore }             from "../store/authStore";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// The login page. The user enters their email (or username) and password.
// On submit we call the backend. On success we fill the auth store and
// navigate to the chat. On failure we show the server's error message.
//
// ─────────────────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate   = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  // ── Local form state ────────────────────────────────────────────────────────
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);  // shown under the form
  const [busy,     setBusy]     = useState(false);                // true while request is in flight

  // ── handleSubmit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();   // stop the browser from reloading the page

    setError(null);  // clear any old error
    setBusy(true);   // disable the button and show "Logging in…"

    try {
      // Call the backend. email can also be a username — the backend accepts both.
      const { user, accessToken } = await loginUser({ email, password });

      // Fill the Zustand store. The app now knows who is logged in.
      setSession(user, accessToken);

      // Navigate to the chat. Replace so the user can't press Back to come here.
      navigate("/chat", { replace: true });

    } catch (err: unknown) {
      // The server sent back an error (wrong password, user not found, etc.)
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);  // always re-enable the button, even on error
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">

        {/* Card */}
        <div className="rounded-[var(--radius)] border border-border bg-card shadow-md p-8 space-y-6">

          {/* Header */}
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email or username */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-foreground"
              >
                Email or username
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-foreground"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Error area — only shown when there is an error */}
            {error && (
              <div className="rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit button — shows a busy message while the request is in flight */}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "Logging in…" : "Log in"}
            </button>

          </form>

          {/* Link to the register page */}
          <p className="text-center text-sm text-muted-foreground">
            No account yet?{" "}
            <Link
              to="/register"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Register here
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
