import { create } from "zustand";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// In-memory store for the conversation list.
// This is the SINGLE SOURCE OF TRUTH for the sidebar.
//
// It is populated once from the REST API on startup.
// After that, socket events keep it up to date without re-fetching.
//
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors the server's conversation shape (see frontend_context §2.2)
export interface ConversationSummary {
  id:             string;
  isGroup:        boolean;
  displayName:    string;
  displayPicture: string | null;
  lastMessage: {
    textBody:   string | null;
    senderId:   string;
    createdAt:  string;
    deletedAt?: string | null;
  } | null;
  unreadCount:  number;
  participants: Array<{ id: string; username: string }>;
}

interface ConversationState {
  // ── Data ────────────────────────────────────────────────────────────────────
  conversations: ConversationSummary[];   // sorted newest-message-first

  // ── Actions ─────────────────────────────────────────────────────────────────

  // Called once after fetching GET /api/conversations
  setAll: (list: ConversationSummary[]) => void;

  // Called when a new conversation is created (socket: conversation:created)
  addOrUpdate: (conv: ConversationSummary) => void;

  // Called when a new message arrives (socket: message:new).
  // Updates the preview and moves the conversation to the top.
  bumpConversation: (
    conversationId: string,
    lastMessage: ConversationSummary["lastMessage"],
    incrementUnread: boolean,   // true if the user is NOT currently in that chat
  ) => void;

  // Called when the user opens a conversation.
  // Clears the unread badge instantly (optimistic).
  clearUnread: (conversationId: string) => void;

  // Called when the server confirms the new unread count.
  setUnreadCount: (conversationId: string, count: number) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],

  setAll: (list) =>
    set({ conversations: list }),

  addOrUpdate: (conv) =>
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conv.id);
      if (exists) {
        // Replace the existing entry
        return {
          conversations: state.conversations.map((c) =>
            c.id === conv.id ? conv : c
          ),
        };
      }
      // Add to the top (newest first)
      return { conversations: [conv, ...state.conversations] };
    }),

  bumpConversation: (conversationId, lastMessage, incrementUnread) =>
    set((state) => {
      const updated = state.conversations.map((c) => {
        if (c.id !== conversationId) return c;
        return {
          ...c,
          lastMessage,
          unreadCount: incrementUnread ? c.unreadCount + 1 : c.unreadCount,
        };
      });

      // Move the bumped conversation to the top of the list
      const idx = updated.findIndex((c) => c.id === conversationId);
      if (idx <= 0) return { conversations: updated };
      const [bumped] = updated.splice(idx, 1);
      return { conversations: [bumped, ...updated] };
    }),

  clearUnread: (conversationId) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    })),

  setUnreadCount: (conversationId, count) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: count } : c
      ),
    })),
}));