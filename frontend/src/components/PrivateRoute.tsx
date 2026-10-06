import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore }                  from "../store/authStore";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Wraps any route that requires a logged-in user.
// If there is no user → redirect to /login and remember where they wanted to go.
// If there IS a user → render the actual page (via <Outlet />).
//
// HOW TO USE:
//   <Route element={<PrivateRoute />}>
//     <Route path="/chat" element={<ChatPage />} />
//     <Route path="/settings" element={<SettingsPage />} />
//   </Route>
//
// ─────────────────────────────────────────────────────────────────────────────

export function PrivateRoute() {
  const user     = useAuthStore((s) => s.user);
  const location = useLocation();  // the page they were trying to reach

  if (!user) {
    // No user → send them to login.
    // We pass `state: { from: location }` so the login page can send them
    // back to the original destination after they log in.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // User is logged in → render whatever child route is matched.
  return <Outlet />;
}
