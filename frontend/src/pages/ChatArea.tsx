import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate }       from "react-router-dom";
import { useAuthStore }                 from "../store/authStore";
import { useConversationStore }         from "../store/conversationStore";
import { useConnectionStore }           from "../store/connectionStore";
import { ChatHeader }                   from "../components/chat/ChatHeader";
import { MessageList }                  from "../components/chat/MessageList";
import { Composer }                     from "../components/chat/Composer";
import { socket }                       from "../lib/socket";
import { type Message }                 from "../api/messages.api";

// ─── WHAT THIS PAGE DOES ──────────────────────────────────────────────────────
//
// The main chat view. Rendered when the user opens a conversation at /c/:id.
//
// Responsibilities:
//   1. Find the conversation data from the Zustand store (loaded by the sidebar).
//   2. Use the SHARED Socket.IO singleton (managed by useSocketConnection in App.tsx).
//      ⚠️ Do NOT create a new io() instance here — that would cause double-connect
//         errors in React StrictMode and fight with the global connection manager.
//   3. Collect live messages as they arrive from the socket.
//   4. Update message statuses (PENDING → SENT → DELIVERED → READ).
//   5. Render ChatHeader + MessageList + Composer.
//
// ─────────────────────────────────────────────────────────────────────────────

// Status rank — we only update if the new status is higher (never go backwards).
const STATUS_RANK: Record<string, number> = {
  PENDING:   0,
  SENT:      1,
  DELIVERED: 2,
  READ:      3,
  FAILED:    -1,
};

export function ChatArea() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate           = useNavigate();
  const currentUser        = useAuthStore((s) => s.user)!;
  const conversations      = useConversationStore((s) => s.conversations);
  const clearUnread        = useConversationStore((s) => s.clearUnread);
  const bumpConversation   = useConversationStore((s) => s.bumpConversation);

  // Read connection status from the global connection store (set by useSocketConnection).
  const connectionStatus   = useConnectionStore((s) => s.status);
  const isConnected        = connectionStatus === "connected";

  const [liveMessages, setLiveMessages] = useState<Message[]>([]);

  // Find the conversation object from the sidebar store.
  const conversation = conversations.find((c) => c.id === conversationId);

  // ── Reset live messages when conversation changes ─────────────────────────────
  useEffect(() => {
    setLiveMessages([]);
    // Clear the unread badge when the user opens this conversation.
    if (conversationId) clearUnread(conversationId);
  }, [conversationId, clearUnread]);

  // ── Listen for incoming messages ──────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return;

    const onMessageNew = (payload: { message: Message }) => {
      const { message } = payload;
      if (message.conversationId !== conversationId) return;

      setLiveMessages((prev) => {
        // De-duplicate by id
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });

      // Also bump the conversation row in the sidebar.
      bumpConversation(
        message.conversationId,
        {
          textBody:  message.textBody,
          senderId:  message.senderId,
          createdAt: message.createdAt,
          deletedAt: message.deletedAt,
        },
        false, // currently open — don't increment unread
      );
    };

    socket.on("message:new", onMessageNew);
    return () => { socket.off("message:new", onMessageNew); };
  }, [conversationId, bumpConversation]);

  // ── Listen for status updates ──────────────────────────────────────────────────
  useEffect(() => {
    const onStatus = (payload: { messageId: string; status: Message["status"] }) => {
      setLiveMessages((prev) =>
        prev.map((m) => {
          if (m.id !== payload.messageId) return m;
          // Only upgrade — never go backwards.
          if ((STATUS_RANK[payload.status] ?? -1) > (STATUS_RANK[m.status] ?? -1)) {
            return { ...m, status: payload.status };
          }
          return m;
        })
      );
    };

    socket.on("message:status", onStatus);
    return () => { socket.off("message:status", onStatus); };
  }, []);

  // ── Optimistic send — add immediately as PENDING ──────────────────────────────
  const handleOptimisticSend = useCallback((message: Omit<Message, "sender">) => {
    setLiveMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) return prev;
      return [...prev, message as Message];
    });
  }, []);

  // ── If the conversation is not in the store yet, show a loader ───────────────
  if (!conversation) {
    return (
      <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
        Loading conversation…
      </div>
    );
  }

  // Build a richer conversation object the ChatHeader needs.
  // The sidebar store's participants only have { id, username }, so we adapt.
  const headerConversation = {
    id:             conversation.id,
    isGroup:        conversation.isGroup,
    displayName:    conversation.displayName,
    displayPicture: conversation.displayPicture,
    participants:   conversation.participants.map((p) => ({
      id:            p.id,
      username:      p.username,
      avatarAddress: null as string | null,
      lastSeen:      null as string | null,
    })),
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <ChatHeader
        conversation={headerConversation}
        onBack={() => navigate("/")}
      />

      {/* ── Message list ─────────────────────────────────────────────────────── */}
      <MessageList
        conversationId={conversation.id}
        conversationName={conversation.displayName}
        isGroup={conversation.isGroup}
        liveMessages={liveMessages}
      />

      {/* ── Composer ─────────────────────────────────────────────────────────── */}
      <Composer
        conversationId={conversation.id}
        socket={socket}
        isConnected={isConnected}
        onOptimisticSend={handleOptimisticSend}
      />

    </div>
  );
}
