import { useEffect, useRef, useState } from "react";
import { socket }             from "../lib/socket";
import { ClientEvents, ServerEvents } from "../constants/events";
import { useConnectionStore } from "../store/connectionStore";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Manages joining and leaving conversation rooms.
//
// USAGE inside your ChatWindow:
//   const { isJoined } = useRoomManager(conversationId);
//   // Only render live messages AFTER isJoined is true.
//
// ON CONVERSATION CHANGE:
//   Emits leave for the old conversation, join for the new one.
//
// ON RECONNECT:
//   The connectionStore status changes to "connected" when the socket
//   reconnects. This hook watches that change and re-emits join automatically.
//
// ─────────────────────────────────────────────────────────────────────────────

export function useRoomManager(conversationId: string) {
  const [isJoined, setIsJoined] = useState(false);
  const status = useConnectionStore((s) => s.status);
  // Remember the previous conversationId so we can emit leave before join.
  const prevConversationId = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId) return;

    // ── Leave the previous room ────────────────────────────────────────────────
    if (
      prevConversationId.current &&
      prevConversationId.current !== conversationId
    ) {
      socket.emit(ClientEvents.CONVERSATION_LEAVE, {
        conversationId: prevConversationId.current,
      });
    }
    prevConversationId.current = conversationId;

    // ── Reset — we are not yet joined in the new room ──────────────────────────
    setIsJoined(false);

    // ── Emit join ─────────────────────────────────────────────────────────────
    socket.emit(ClientEvents.CONVERSATION_JOIN, { conversationId });

    // ── Listen for the server's ack ───────────────────────────────────────────
    function onJoined({ conversationId: joinedId }: { conversationId: string }) {
      if (joinedId === conversationId) {
        setIsJoined(true);
      }
    }

    socket.on(ServerEvents.CONVERSATION_JOINED, onJoined);

    // ── Cleanup: leave the room and remove the listener ────────────────────────
    return () => {
      socket.off(ServerEvents.CONVERSATION_JOINED, onJoined);
      socket.emit(ClientEvents.CONVERSATION_LEAVE, { conversationId });
      setIsJoined(false);
    };
  // Re-run when the conversation changes OR when the socket reconnects.
  // When status goes from "reconnecting" to "connected", this effect re-runs
  // and re-emits conversation:join automatically.
  }, [conversationId, status]);

  return { isJoined };
}
