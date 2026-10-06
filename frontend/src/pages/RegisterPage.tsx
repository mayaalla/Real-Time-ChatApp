import { useState, type FormEvent } from "react";
import { useNavigate, Link }   from "react-router-dom";
import { registerUser }        from "../api/auth.api";
import { useAuthStore }        from "../store/authStore";

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
      navigate("/chat", { replace: true });

    } catch (err: unknown) {
      // Could be "email already taken", "username already taken", etc.
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1>Create account</h1>

      <form onSubmit={handleSubmit}>

        {/* Email */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        {/* Username */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="username">Username (3–20 characters)</label>
          <br />
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="password">Password (minimum 8 characters)</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        {/* Confirm password */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="confirm">Confirm password</label>
          <br />
          <input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        {/* Error area */}
        {error && (
          <div style={{ color: "red", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={busy}
          style={{ width: "100%", padding: 10 }}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>

      </form>

      {/* Link back to login */}
      <p style={{ marginTop: 16 }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}