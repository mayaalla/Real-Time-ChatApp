import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore }       from "./store/authStore";
import { useSessionRestore }  from "./hooks/useSessionRestore";
import { useLogout }          from "./hooks/useLogout";
import { LoadingScreen }      from "./components/LoadingScreen";
import { PrivateRoute }       from "./components/PrivateRoute";
import { PublicOnlyRoute }    from "./components/PublicOnlyRoute";
import { ChatShell }          from "./layouts/ChatShell";
import { EmptyState }         from "./components/EmptyState";
import { ChatArea }           from "./pages/ChatArea";
import { LoginPage }          from "./pages/LoginPage";
import { RegisterPage }       from "./pages/RegisterPage";
import { NotFoundPage }       from "./pages/NotFoundPage";
import './App.css'

export default function App() {
  // Attempt session restore on EVERY page load (reads the refresh cookie).
  useSessionRestore();

  const isCheckingAuth = useAuthStore((s) => s.isCheckingAuth);

  // While checking, show a loading screen.
  // This prevents any route guard from running before we know the session status.
  if (isCheckingAuth) {
    return <LoadingScreen />;
  }

  return (
    <BrowserRouter>
      <Routes>

        {/* ── Public-only routes (login / register) ──────────────────────── */}
        {/* If you are already logged in, these redirect you to /chat.        */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* ── Private routes (require login) ─────────────────────────────── */}
        {/* If you are NOT logged in, these redirect you to /login.           */}
        <Route element={<PrivateRoute />}>
          <Route element={<ChatShell />}>
            <Route path="/"       element={<EmptyState />} />
            <Route path="/c/:conversationId" element={<ChatArea />} />
          </Route>
          {/* Add more private routes here as you build them */}
        </Route>

        {/* ── Root redirect ──────────────────────────────────────────────── */}
        {/* Typing just "/" goes to /chat (which may redirect to /login).     */}
        <Route path="/chat" element={<Navigate to="/" replace />} />

        {/* ── 404 fallback ───────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </BrowserRouter>
  );
}
