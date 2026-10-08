import { useConnectionStore } from "../../store/connectionStore";

// ─── ConnectionBanner ────────────────────────────────────────────────────────
//
// Shows a "Reconnecting..." strip at the top of the screen when the socket
// is not connected. Reads from the Zustand connectionStore.
// Render this once in your authenticated layout — above the sidebar and chat.
//
// ─────────────────────────────────────────────────────────────────────────────

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);

  if (status === "connected") return null; // nothing to show when connected

  const messages: Record<string, string> = {
    disconnected: "You are disconnected. Trying to reconnect...",
    reconnecting: "Reconnecting...",
    error:        "Connection failed. Please refresh the page.",
  };

  const label = messages[status] ?? "Connecting...";

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-destructive/90 text-destructive-foreground
                 text-xs text-center py-1.5 px-4 font-medium z-50"
    >
      {label}
    </div>
  );
}