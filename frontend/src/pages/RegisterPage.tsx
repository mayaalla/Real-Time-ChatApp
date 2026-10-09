import { useState, type FormEvent } from "react";
import { useNavigate, Link }        from "react-router-dom";
import { registerUser }             from "../api/auth.api";
import { useAuthStore }             from "../store/authStore";
import { BrandLogo }                from "../components/BrandLogo";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// The register page. The user fills in email, username, password and
// password confirmation. We validate on the client FIRST (before sending)
// using the same rules the backend uses, so errors appear instantly.
// On success, we log the user in (the backend returns the session directly).
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Client-side validation ────────────────────────────────────────────────────
// These rules match the backend Zod schemas. Always keep them in sync.
function validate(
  email: string,
  username: string,
  password: string,
  confirm: string,
): string | null {  // returns an error message, or null if everything is fine

  // Basic email check — just look for @ and a dot after it
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Please enter a valid email address";
  }

  // Username: 3 to 20 characters, letters/numbers/underscores only
  if (username.length < 3 || username.length > 20) {
    return "Username must be between 3 and 20 characters";
  }

  // Password: at least 8 characters
  if (password.length < 8) {
    return "Password must be at least 8 characters";
  }

  // Confirm password must match
  if (password !== confirm) {
    return "Passwords do not match";
  }

  return null;  // all good
}

export function RegisterPage() {
  const navigate   = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  // ── Local form state ────────────────────────────────────────────────────────
  const [email,    setEmail]    = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [busy,     setBusy]     = useState(false);

  // ── handleSubmit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // ── 1. Client-side validation FIRST ───────────────────────────────────────
    const validationError = validate(email, username, password, confirm);
    if (validationError) {
      setError(validationError);
      return;  // stop here — don't even make the network request
    }

    setError(null);
    setBusy(true);

    try {
      // ── 2. Send to backend ────────────────────────────────────────────────
      const { user, accessToken } = await registerUser({ email, username, password });

      // ── 3. The backend registers AND logs us in in one step ───────────────
      setSession(user, accessToken);
      navigate("/", { replace: true });

    } catch (err: unknown) {
      // Could be "email already taken", "username already taken", etc.
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  // Shared Tailwind classes for inputs — defined once to stay DRY
  const inputCls =
    "w-full rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <BrandLogo />
        </div>

        {/* Card */}
        <div className="rounded-[var(--radius)] border border-border bg-card shadow-md p-8 space-y-6">

          {/* Header */}
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-card-foreground">
              Create an account
            </h1>
            <p className="text-sm text-muted-foreground">
              Fill in the details below to get started
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium text-foreground">
                Username{" "}
                <span className="text-muted-foreground font-normal">(3–20 characters)</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={20}
                placeholder="your_handle"
                className={inputCls}
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                Password{" "}
                <span className="text-muted-foreground font-normal">(min. 8 characters)</span>
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label htmlFor="confirm" className="text-sm font-medium text-foreground">
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="••••••••"
                className={inputCls}
              />
            </div>

            {/* Error area */}
            {error && (
              <div className="rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-[var(--radius-md)] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? "Creating account…" : "Create account"}
            </button>

          </form>

          {/* Link back to login */}
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          </p>

        </div>
      </div>
    </div>
  );
}
