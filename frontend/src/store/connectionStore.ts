import { create } from "zustand";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Stores the current socket connection status.
// Any component that needs to show "Reconnecting..." reads from here.
// The useSocketConnection hook writes to this store.
//
// STATUS VALUES:
//   "connected"    → socket is open and working
//   "disconnected" → socket is closed (not trying to reconnect yet)
//   "reconnecting" → socket lost connection and is actively retrying
//   "error"        → connection failed with an unrecoverable error
//
// ─────────────────────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "error";

interface ConnectionState {
  status:    ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status:    "disconnected",
  setStatus: (status) => set({ status }),
}));
