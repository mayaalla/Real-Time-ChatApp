import { useEffect } from "react";
import { useAuthStore } from "../store/authStore.ts";
import { refreshSession, fetchMe, RateLimitError } from "../api/auth.api";
import { setAccessToken } from "../lib/axios";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// This hook runs ONCE when the app first loads.
// It tries to restore a previous session using the refresh cookie.
//
// FLOW:
//   1. isCheckingAuth is true (set in the store's initial state).
//   2. We call refreshSession() → if ok, we get a new access token.
//   3. We call fetchMe() with that token → we get the user object.
//   4. We call setSession(user, token) → store is filled.
//   5. isCheckingAuth becomes false → the app renders normally (logged in).
//
//   If refreshSession() throws RateLimitError (429):
//   6. The session MIGHT still be valid — we just can't verify it right now.
//      Do NOT clear the session. Set isCheckingAuth=false so the app can
//      render. The user stays on whatever page they were on.
//
//   If refreshSession() throws any other error (401, network, etc.):
//   7. We call clearSession() → store is empty, isCheckingAuth = false.
//      The app renders normally (logged out → login page).
//
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠️  STRICT MODE GUARD (module-level, not useRef)
// React 18 Strict Mode intentionally mounts → unmounts → remounts every
// component in development. That makes useEffect fire TWICE. Without a guard:
//   • Call 1 → refreshSession() succeeds, server ROTATES + REVOKES old token.
//   • Call 2 → refreshSession() fires again with the same (now-revoked) cookie
//              → server returns 401 → clearSession() → user sent to /login. 💥
//
// A module-level variable (outside the hook function) is never reset by React's
// remount cycle and is the most reliable guard for this pattern.
// ─────────────────────────────────────────────────────────────────────────────

// Module-level flag — survives React Strict Mode's mount/unmount/remount cycle.
let sessionRestoreAttempted = false;

export function useSessionRestore() {
  const setSession       = useAuthStore((s) => s.setSession);
  const clearSession     = useAuthStore((s) => s.clearSession);
  const setIscheckingAuth = useAuthStore((s) => s.setIscheckingAuth);

  useEffect(() => {
    // ← Guard: only run the network call once, even in Strict Mode.
    if (sessionRestoreAttempted) return;
    sessionRestoreAttempted = true;

    // Async IIFE because useEffect callback cannot be async directly.
    (async () => {
      try {
        // Step 1: Ask the server for a fresh access token via the HttpOnly cookie.
        const token = await refreshSession();

        // Step 2: Sync the token into the axios interceptor IMMEDIATELY.
        // Without this, the very first axios request after restore would have
        // no Authorization header and get a 401.
        setAccessToken(token);

        // Step 3: Use the new token to fetch who we are.
        const user = await fetchMe(token);

        // Step 4: Fill the Zustand store — app now knows we are logged in.
        setSession(user, token);

      } catch (err) {
        if (err instanceof RateLimitError) {
          // The server is temporarily rate-limiting the refresh endpoint.
          // This does NOT mean the session is invalid — it means we sent too
          // many requests in a short window. Do NOT clear the session; just
          // stop the loading spinner so the app can render. The user keeps
          // whatever auth state they already had.
          setIscheckingAuth(false);
          return;
        }

        // Any other failure (401, network error, etc.) → session is genuinely
        // gone. Mark the user as logged out.
        setAccessToken(null);
        clearSession();
      }
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
