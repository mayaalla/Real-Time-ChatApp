import { create } from "zustand";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Stores who is currently typing in each conversation.
// Updated by the socket "typing:update" event (wired in ChatArea).
//
// typingMap: Map<conversationId, userId[]>
//
// ─────────────────────────────────────────────────────────────────────────────

interface TypingState {
  typingMap: Map<string, string[]>;
  setTypers: (conversationId: string, typerIds: string[]) => void;
  clearTypers: (conversationId: string) => void;
}

export const useTypingStore = create<TypingState>((set, get) => ({
  typingMap: new Map(),

  setTypers: (conversationId, typerIds) =>
    set(() => {
      const next = new Map(get().typingMap);
      next.set(conversationId, typerIds);
      return { typingMap: next };
    }),

  clearTypers: (conversationId) =>
    set(() => {
      const next = new Map(get().typingMap);
      next.delete(conversationId);
      return { typingMap: next };
    }),
}));
