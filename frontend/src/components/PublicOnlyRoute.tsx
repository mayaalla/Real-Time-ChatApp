import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore }                  from "../store/authStore";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Wraps routes that are only for logged-OUT users (login, register).
// If the user IS already logged in → redirect to /chat.
// If the user is NOT logged in → render the actual page (via <Outlet />).
//
// HOW TO USE:
//   <Route element={<PublicOnlyRoute />}>
//     <Route path="/login"    element={<LoginPage />} />
//     <Route path="/register" element={<RegisterPage />} />
//   </Route>
//
// ─────────────────────────────────────────────────────────────────────────────

export function PublicOnlyRoute() {
  const user     = useAuthStore((s) => s.user);
  const location = useLocation();

  // If there's already a logged-in user and they came from somewhere specific,
  // send them there. Otherwise, default to /chat.
  const destination =
    (location.state as { from?: Location } | null)?.from?.pathname ?? "/chat";

  if (user) {
    return <Navigate to={destination} replace />;
  }

  return <Outlet />;
}
