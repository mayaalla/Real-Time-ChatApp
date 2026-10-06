import { useEffect }            from "react";
import { useParams }            from "react-router-dom";
import { useConversationStore } from "../store/conversationStore";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Listens for socket events that affect the conversation list and updates
// the Zustand store accordingly. Call this hook ONCE from the ChatShell.
//
// It needs access to the socket instance. We pass it as a parameter so this
// hook stays decoupled from where the socket is created.
//
// Events handled:
//   message:new              → bump conversation row + unread badge
//   conversation:unread_count → sync the badge with the server's count
//   conversation:created     → add a new conversation row at the top
//
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useConversationSocket(socket: any | null) {
  const { conversationId: activeConversationId } = useParams<{ conversationId?: string }>();
  const { bumpConversation, setUnreadCount, addOrUpdate } = useConversationStore();

  useEffect(() => {
    if (!socket) return;

    // ── message:new ────────────────────────────────────────────────────────────
    // Payload: { message: { id, conversationId, senderId, textBody, attachments, createdAt } }
    const onMessageNew = (payload: {
      message: {
        conversationId: string;
        senderId:       string;
        textBody:       string | null;
        createdAt:      string;
        deletedAt?:     string | null;
      };
    }) => {
      const { message } = payload;
      const isCurrentlyOpen = message.conversationId === activeConversationId;

      bumpConversation(
        message.conversationId,
        {
          textBody:  message.textBody,
          senderId:  message.senderId,
          createdAt: message.createdAt,
          deletedAt: message.deletedAt ?? null,
        },
        !isCurrentlyOpen,   // increment unread only if the chat is not open
      );
    };

    // ── conversation:unread_count ──────────────────────────────────────────────
    // Payload: { conversationId: string, unreadCount: number }
    const onUnreadCount = (payload: { conversationId: string; unreadCount: number }) => {
      setUnreadCount(payload.conversationId, payload.unreadCount);
    };

    // ── conversation:created ───────────────────────────────────────────────────
    // Payload: { conversation: { id, isGroup, name, createdAt } }
    // NOTE: The socket payload only has partial data. We do NOT update the store
    //       here — instead we re-fetch the full list so we get displayName etc.
    // This is a simple approach; advanced apps would merge the data inline.
    const onConversationCreated = () => {
      // The sidebar will re-fetch via fetchConversations on next mount.
      // For a full real-time experience, trigger a refetch here.
      // We leave this as a comment — wire it when you have the socket/query setup.
    };

    socket.on("message:new",              onMessageNew);
    socket.on("conversation:unread_count", onUnreadCount);
    socket.on("conversation:created",     onConversationCreated);

    return () => {
      socket.off("message:new",              onMessageNew);
      socket.off("conversation:unread_count", onUnreadCount);
      socket.off("conversation:created",     onConversationCreated);
    };
  }, [socket, activeConversationId, bumpConversation, setUnreadCount, addOrUpdate]);
}