import { create } from "zustand";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Stores who is currently typing in each conversation.
// Updated by the socket "typing:update" event (wired in ChatArea).
//
// typingMap: Map<conversationId, userId[]>
//
// ─────────────────────────────────────────────────────────────────────────────

// Stores who is currently typing, per conversation.
// Updated by the socket's typing:update event handler.

interface TypingState {
  typingMap: Map<string, string[]>;
  setTyping: (conversationId: string, userIds: string[]) => void;
}

export const useTypingStore = create<TypingState>((set) => ({
  typingMap: new Map(),
  setTyping: (conversationId, userIds) =>
    set((s) => {
      const next = new Map(s.typingMap);
      next.set(conversationId, userIds);
      return { typingMap: next };
    }),
}));
