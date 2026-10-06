import { useState, type FormEvent } from "react";
import { useNavigate, Link }   from "react-router-dom";
import { loginUser }           from "../api/auth.api";
import { useAuthStore }        from "../store/authStore";

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
    <div style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1>Log in</h1>

      <form onSubmit={handleSubmit}>

        {/* Email or username */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email">Email or username</label>
          <br />
          <input
            id="email"
            type="text"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        {/* Password */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </div>

        {/* Error area — only shown when there is an error */}
        {error && (
          <div style={{ color: "red", marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Submit button — shows a busy message while the request is in flight */}
        <button
          type="submit"
          disabled={busy}
          style={{ width: "100%", padding: 10 }}
        >
          {busy ? "Logging in…" : "Log in"}
        </button>

      </form>

      {/* Link to the register page */}
      <p style={{ marginTop: 16 }}>
        No account yet? <Link to="/register">Register here</Link>
      </p>
    </div>
  );
}
