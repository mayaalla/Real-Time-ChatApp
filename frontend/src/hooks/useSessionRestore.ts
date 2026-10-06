import { useEffect } from "react";
import { useAuthStore } from "../store/authStore.ts";
import { refreshSession, fetchMe } from "../api/auth.api";

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
//   If refreshSession() throws:
//   6. We call clearSession() → store is empty, isCheckingAuth = false.
//   7. The app renders normally (logged out → login page).
//
// ─────────────────────────────────────────────────────────────────────────────

export function useSessionRestore() {
  const setSession    = useAuthStore((s) => s.setSession);
  const clearSession  = useAuthStore((s) => s.clearSession);

  useEffect(() => {
    // This effect runs once when the component mounts.
    // We use an async IIFE (Immediately Invoked Function Expression) because
    // useEffect cannot directly take an async function.
    (async () => {
      try {
        // Step 1: Ask the server for a fresh access token using the cookie.
        const token = await refreshSession();

        // Step 2: Use the new token to fetch who we are.
        const user = await fetchMe(token);

        // Step 3: Fill the store — the app now knows we are logged in.
        setSession(user, token);

      } catch {
        // Refresh failed — no valid session. Mark the user as a guest.
        // isCheckingAuth will become false inside clearSession().
        clearSession();
      }
    })();

    // Empty dependency array [] means: run this effect only ONCE on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
