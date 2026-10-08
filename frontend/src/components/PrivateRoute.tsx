import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore }                  from "../store/authStore";
import { LoadingScreen }                 from "./LoadingScreen";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Wraps any route that requires a logged-in user.
//
// Three states:
//   1. isCheckingAuth = true  → session restore is still in flight → show spinner.
//                               NEVER redirect yet — the token may be valid!
//   2. isCheckingAuth = false, user = null → definitely not logged in → /login.
//   3. isCheckingAuth = false, user = set  → logged in → render the child route.
//
// HOW TO USE:
//   <Route element={<PrivateRoute />}>
//     <Route path="/chat" element={<ChatPage />} />
//     <Route path="/settings" element={<SettingsPage />} />
//   </Route>
//
// ─────────────────────────────────────────────────────────────────────────────

export function PrivateRoute() {
  const user            = useAuthStore((s) => s.user);
  const isCheckingAuth  = useAuthStore((s) => s.isCheckingAuth);
  const location        = useLocation();  // the page they were trying to reach

  // ── Guard 1: Still restoring the session ─────────────────────────────────
  // App.tsx already shows <LoadingScreen /> at this point, but this is a
  // belt-and-suspenders safety check so PrivateRoute NEVER redirects while
  // the async refresh call is still in flight.
  if (isCheckingAuth) {
    return <LoadingScreen />;
  }

  // ── Guard 2: No session found → send to login ─────────────────────────────
  if (!user) {
    // We pass `state: { from: location }` so the login page can send them
    // back to the original destination after they log in.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // ── Authenticated: render whatever child route is matched ─────────────────
  return <Outlet />;
}
