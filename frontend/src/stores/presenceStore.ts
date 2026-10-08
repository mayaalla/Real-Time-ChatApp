import { create } from "zustand";

// Stores online/offline status for every user we know about.
// Updated by the socket's presence:update and presence:snapshot event handlers.

interface PresenceEntry {
  online:   boolean;
  lastSeen: string | null;
}

interface PresenceState {
  presenceMap:    Map<string, PresenceEntry>;
  setPresence:    (userId: string, entry: PresenceEntry) => void;
  setPresenceMap: (map: Map<string, PresenceEntry>) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  presenceMap: new Map(),

  setPresence: (userId, entry) =>
    set((s) => {
      const next = new Map(s.presenceMap);
      next.set(userId, entry);
      return { presenceMap: next };
    }),

  setPresenceMap: (map) => set({ presenceMap: map }),
}));
