import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate }       from "react-router-dom";
import { io, Socket }                   from "socket.io-client";
import { useAuthStore }                 from "../store/authStore";
import { useConversationStore }         from "../store/conversationStore";
import { usePresenceStore }             from "../stores/presenceStore";
import { useTypingStore }               from "../stores/typingStore";
import { ChatHeader }                   from "../components/chat/ChatHeader";
import { MessageList }                  from "../components/chat/MessageList";
import { Composer }                     from "../components/chat/Composer";
import { Message }                      from "../api/messages.api";

// ─── WHAT THIS PAGE DOES ──────────────────────────────────────────────────────
//
// The main chat view. Rendered when the user opens a conversation at /c/:id.
//
// Responsibilities:
//   1. Find the conversation data from the Zustand store (loaded by the sidebar).
//   2. Create and manage a Socket.IO connection (once per session).
//   3. Wire socket events into the presence and typing Zustand stores.
//   4. Collect live messages as they arrive from the socket.
//   5. Update message statuses (PENDING → SENT → DELIVERED → READ).
//   6. Render ChatHeader + MessageList + Composer.
//
// ─────────────────────────────────────────────────────────────────────────────

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string ?? import.meta.env.VITE_API_URL as string;

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
  const token              = useAuthStore((s) => s.accessToken)!;
  const currentUser        = useAuthStore((s) => s.user)!;
  const conversations      = useConversationStore((s) => s.conversations);
  const clearUnread        = useConversationStore((s) => s.clearUnread);
  const bumpConversation   = useConversationStore((s) => s.bumpConversation);
  const setPresence        = usePresenceStore((s) => s.setPresence);
  const setTypers          = useTypingStore((s) => s.setTypers);

  const [socket, setSocket]           = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);

  // Find the conversation object from the sidebar store.
  const conversation = conversations.find((c) => c.id === conversationId);

  // ── Create the socket once on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    const sock = io(SOCKET_URL, {
      auth:              { token },
      transports:        ["websocket"],
      reconnectionDelay: 1000,
    });

    sock.on("connect",    () => setIsConnected(true));
    sock.on("disconnect", () => setIsConnected(false));

    setSocket(sock);
    return () => {
      sock.disconnect();
    };
  }, [token]);

  // ── Wire presence events ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // presence:update  { userId, online, lastSeen }
    const onPresence = (payload: { userId: string; online: boolean; lastSeen: string | null }) => {
      setPresence(payload.userId, { online: payload.online, lastSeen: payload.lastSeen });
    };

    socket.on("presence:update", onPresence);
    return () => { socket.off("presence:update", onPresence); };
  }, [socket, setPresence]);

  // ── Wire typing events ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // typing:update  { conversationId, typerIds: string[] }
    const onTyping = (payload: { conversationId: string; typerIds: string[] }) => {
      setTypers(payload.conversationId, payload.typerIds);
    };

    socket.on("typing:update", onTyping);
    return () => { socket.off("typing:update", onTyping); };
  }, [socket, setTypers]);

  // ── Reset live messages when conversation changes ─────────────────────────────
  useEffect(() => {
    setLiveMessages([]);
    // Clear the unread badge when the user opens this conversation.
    if (conversationId) clearUnread(conversationId);
  }, [conversationId, clearUnread]);

  // ── Listen for incoming messages ──────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !conversationId) return;

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
  }, [socket, conversationId, bumpConversation]);

  // ── Listen for status updates ──────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // message:status  { messageId, status }
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
  }, [socket]);

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
