import { create } from "zustand";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Stores the online/offline presence status for each user.
// Updated by the socket "presence:update" event (wired in ChatArea).
//
// presenceMap: Map<userId, { online: boolean; lastSeen: string | null }>
//
// ─────────────────────────────────────────────────────────────────────────────

interface PresenceEntry {
  online: boolean;
  lastSeen: string | null;
}

interface PresenceState {
  presenceMap: Map<string, PresenceEntry>;
  setPresence: (userId: string, entry: PresenceEntry) => void;
  setManyPresence: (entries: Array<{ userId: string } & PresenceEntry>) => void;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  presenceMap: new Map(),

  setPresence: (userId, entry) =>
    set(() => {
      const next = new Map(get().presenceMap);
      next.set(userId, entry);
      return { presenceMap: next };
    }),

  setManyPresence: (entries) =>
    set(() => {
      const next = new Map(get().presenceMap);
      for (const { userId, online, lastSeen } of entries) {
        next.set(userId, { online, lastSeen });
      }
      return { presenceMap: next };
    }),
}));
