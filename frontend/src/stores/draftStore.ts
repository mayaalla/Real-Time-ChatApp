import { create } from "zustand";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Stores per-conversation draft text in memory.
// When the user switches chat, their unfinished message is preserved.
// Drafts live in memory only — they clear on page refresh (intentional).
//
// ─────────────────────────────────────────────────────────────────────────────

interface DraftState {
  drafts: Map<string, string>;
  setDraft:   (conversationId: string, text: string) => void;
  getDraft:   (conversationId: string) => string;
  clearDraft: (conversationId: string) => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: new Map(),

  setDraft: (conversationId, text) =>
    set((s) => {
      const next = new Map(s.drafts);
      next.set(conversationId, text);
      return { drafts: next };
    }),

  getDraft: (conversationId) =>
    get().drafts.get(conversationId) ?? "",

  clearDraft: (conversationId) =>
    set((s) => {
      const next = new Map(s.drafts);
      next.delete(conversationId);
      return { drafts: next };
    }),
}));
