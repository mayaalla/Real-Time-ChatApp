import { useNavigate }    from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore }   from "../store/authStore";
import { logoutUser }     from "../api/auth.api";
import { socket } from "../lib/socket";
import { useConversationStore } from "../store/conversationStore";
import { usePresenceStore } from "../stores/presenceStore";
import { useTypingStore } from "../stores/typingStore";
import { useDraftStore } from "../stores/draftStore";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Call logout() from any component to:
//   1. Tell the server to clear the refresh cookie
//   2. Wipe the auth store (user + token)
//   3. Clear ALL React Query cached data
//   4. Disconnect the socket (if you have a socket store — see note below)
//   5. Navigate to the login page
//
// ─────────────────────────────────────────────────────────────────────────────

export function useLogout() {
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();
  const accessToken   = useAuthStore((s) => s.accessToken);
  const clearSession  = useAuthStore((s) => s.clearSession);

  const logout = async () => {
    // ── Step 1: Tell the backend to clear the refresh cookie ─────────────────
    // We do this first. Even if it fails we still clear local state.
    try {
      if (accessToken) {
        await logoutUser(accessToken);
      }
    } catch {
      // Best effort. If the server is down, we still log out locally.
    }

    // ── Step 2 + 3: Clear the user and access token from the store ───────────
    clearSession();

    // ── Step 4: Clear every cached query from React Query ────────────────────
    // This is critical. Without it, the next user might briefly see
    // the previous user's conversations.
    queryClient.clear();
    useConversationStore.getState().setAll([]);
    usePresenceStore.getState().setPresenceMap(new Map());
    useTypingStore.setState({ typingMap: new Map() });
    useDraftStore.setState({ drafts: new Map() });

    // ── Step 5: Disconnect the socket ────────────────────────────────────────
    socket.disconnect();
    socket.sendBuffer = [];
    socket.auth = { token: "" };

    // ── Step 6: Go to the login page ─────────────────────────────────────────
    navigate("/login", { replace: true });
  };

  return { logout };
}
