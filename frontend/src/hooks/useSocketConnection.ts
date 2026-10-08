import { useEffect } from "react";
import { socket }             from "../lib/socket";
import { useAuthStore }       from "../store/authStore";
import { useConnectionStore } from "../store/connectionStore";
import { ServerEvents }       from "../constants/events";
import { refreshSession }     from "../api/auth.api";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// STATE OWNERSHIP RULES (do not remove this comment):
//   RULE 1: React Query owns history — all loaded messages live in its cache.
//   RULE 2: The socket owns the live tail — incoming messages go INTO the
//           React Query cache, never into a separate component state list.
//   RULE 3: Zustand owns only what the server does not store: connection
//           status, typing indicators, presence map, unsent message queue.
//   RULE 4: Every cache write de-duplicates by message identifier.
//
// Manages the socket lifecycle:
//   - Connects after the user authenticates (access token is present).
//   - Updates Zustand connectionStore on every lifecycle event.
//   - Handles token refresh when the server rejects the token on connect.
//   - Disconnects on logout (accessToken becomes null) and on unmount.
//
// Mount this hook ONCE in your root App or authenticated layout.
// Never call it inside individual chat screens.
//
// ─────────────────────────────────────────────────────────────────────────────

export function useSocketConnection() {
  const accessToken  = useAuthStore((s) => s.accessToken);
  const setToken     = useAuthStore((s) => s.setToken);   // updates accessToken in store
  const setStatus    = useConnectionStore((s) => s.setStatus);

  useEffect(() => {
    // If there is no access token, stay disconnected.
    // This happens before login and after logout.
    if (!accessToken) {
      socket.disconnect();
      setStatus("disconnected");
      return;
    }

    // Set the token and connect.
    // We update auth BEFORE connecting so the server gets the correct token
    // on the very first handshake.
    socket.auth = { token: accessToken };
    socket.connect();

    // ── Lifecycle event handlers ───────────────────────────────────────────────

    function onConnect() {
      setStatus("connected");
    }

    function onDisconnect(reason: string) {
      // "io server disconnect" = the server kicked us intentionally.
      // All other reasons (transport close, ping timeout, etc.) trigger auto-reconnect.
      if (reason === "io server disconnect") {
        setStatus("disconnected");
      } else {
        // socket.io-client will auto-reconnect.
        // Status becomes "reconnecting" once a reconnect_attempt fires.
        setStatus("reconnecting");
      }
    }

    async function onConnectError(err: Error) {
      if (err.message.includes("AUTH_MISSING")) {
        // No token — something is wrong with auth state.
        setStatus("error");
        return;
      }

      if (
        err.message.includes("AUTH_INVALID") ||
        err.message.includes("TOKEN_EXPIRED")
      ) {
        // Our token expired mid-session. Try to refresh it silently.
        try {
          const newToken = await refreshSession(); // POST /api/auth/refresh — returns new access token
          setToken(newToken);                      // update the store
          socket.auth = { token: newToken };
          socket.connect();
        } catch {
          // Refresh also failed — session truly expired.
          // The auth store should redirect to login.
          setStatus("error");
        }
      }
    }

    function onReconnectAttempt() {
      setStatus("reconnecting");
    }

    function onReconnect() {
      // The "connect" event also fires after reconnect and sets status to
      // "connected" — we let that handler do it to keep one source of truth.
    }

    // ── Register all listeners ─────────────────────────────────────────────────
    socket.on(ServerEvents.CONNECT,           onConnect);
    socket.on(ServerEvents.DISCONNECT,        onDisconnect);
    socket.on(ServerEvents.CONNECT_ERROR,     onConnectError);
    socket.on(ServerEvents.RECONNECT_ATTEMPT, onReconnectAttempt);
    socket.on(ServerEvents.RECONNECT,         onReconnect);

    // ── Cleanup: remove listeners and disconnect ───────────────────────────────
    // Runs when accessToken becomes null (logout) or the component unmounts.
    return () => {
      socket.off(ServerEvents.CONNECT,           onConnect);
      socket.off(ServerEvents.DISCONNECT,        onDisconnect);
      socket.off(ServerEvents.CONNECT_ERROR,     onConnectError);
      socket.off(ServerEvents.RECONNECT_ATTEMPT, onReconnectAttempt);
      socket.off(ServerEvents.RECONNECT,         onReconnect);
      // Only hard-disconnect when the user actually logged out (no token).
      // If accessToken is still present this cleanup is just React Strict Mode
      // re-running the effect — disconnecting here would fire the backend
      // presence:offline event immediately after login.
      if (!accessToken) {
        socket.disconnect();
      }
    };
  }, [accessToken]); // Re-run when the user logs in or logs out
}