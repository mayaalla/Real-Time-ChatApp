import { useEffect } from "react";
import { socket }               from "../lib/socket";
import { useTypingStore }       from "../stores/typingStore";
import { usePresenceStore }     from "../stores/presenceStore";
import { type Message }         from "../api/messages.api";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Registers socket event listeners that are specific to the currently open
// conversation. Call this once from ChatArea.
//
// NOTE: The global sidebar listeners (message:new for the list, unread counts,
// conversation:created) live in useConversationSocket.ts (the shell-level hook).
// This hook handles ONLY events that affect the active chat window:
//   typing:update   → fills typingStore so ChatHeader shows "Alice is typing…"
//   presence:update → fills presenceStore so ChatHeader shows the online dot
//   message:new     → passed to the parent via onMessage (for the chat window)
//   message:status  → passed to the parent via onStatus  (for tick updates)
//
// ─────────────────────────────────────────────────────────────────────────────

interface UsePerConversationSocketOptions {
  conversationId: string;
  currentUserId:  string;
  onMessage: (msg: Message) => void;
  onMessageChange: (msg: Message) => void;
  onStatus:  (payload: { messageId: string; status: Message["status"] }) => void;
}

export function usePerConversationSocket({
  conversationId,
  currentUserId,
  onMessage,
  onMessageChange,
  onStatus,
}: UsePerConversationSocketOptions) {
  const setTyping        = useTypingStore((s) => s.setTyping);
  const setPresence      = usePresenceStore((s) => s.setPresence);

  useEffect(() => {
    if (!conversationId) return;

    // ── typing:update ──────────────────────────────────────────────────────────
    // Server sends the current set of typers for this conversation.
    // We filter out ourselves — we already know we are typing.
    const onTypingUpdate = (payload: {
      conversationId: string;
      typerIds:       string[];
    }) => {
      if (payload.conversationId !== conversationId) return;
      const otherTypers = payload.typerIds.filter((id) => id !== currentUserId);
      setTyping(conversationId, otherTypers);
    };

    // ── presence:update ────────────────────────────────────────────────────────
    // Server tells us someone came online or went offline.
    const onPresenceUpdate = (payload: {
      userId:   string;
      online:   boolean;
      lastSeen: string | null;
    }) => {
      setPresence(payload.userId, {
        online:   payload.online,
        lastSeen: payload.lastSeen,
      });
    };

    // ── message:new ────────────────────────────────────────────────────────────
    // New message arrived for the currently open conversation.
    const onMessageNew = (payload: { message: Message }) => {
      const { message } = payload;
      if (message.conversationId !== conversationId) return;


      // Forward to ChatArea to add to the live message list.
      onMessage(message);


    };

    // ── message:status ─────────────────────────────────────────────────────────
    // Tick update for one of our sent messages.
    const onMessageStatus = (payload: {
      messageId: string;
      conversationId: string;
      status:    Message["status"];
    }) => {
      if (payload.conversationId !== conversationId) return;
      onStatus(payload);
    };

    const onMessageChanged = ({ message }: { message: Message }) => {
      if (message.conversationId === conversationId) onMessageChange(message);
    };

    socket.on("typing:update",   onTypingUpdate);
    socket.on("presence:update", onPresenceUpdate);
    socket.on("message:new",     onMessageNew);
    socket.on("message:status",  onMessageStatus);
    socket.on("message:edited", onMessageChanged);
    socket.on("message:deleted", onMessageChanged);

    return () => {
      socket.off("typing:update",   onTypingUpdate);
      socket.off("presence:update", onPresenceUpdate);
      socket.off("message:new",     onMessageNew);
      socket.off("message:status",  onMessageStatus);
      socket.off("message:edited", onMessageChanged);
      socket.off("message:deleted", onMessageChanged);

      // Clear typing state when leaving the conversation so the indicator
      // doesn't linger on the next conversation the user opens.
      setTyping(conversationId, []);
    };
  }, [
    conversationId,
    currentUserId,
    onMessage,
    onMessageChange,
    onStatus,
    setTyping,
    setPresence,
  ]);
}
