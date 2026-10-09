import { useConnectionStore } from "../../store/connectionStore";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Shows a banner at the top of the page when the socket is disconnected or
// reconnecting. Disappears automatically when the connection is restored.
//
// States:
//   reconnecting → yellow banner with spinning icon: "Reconnecting…"
//   disconnected → red banner: "You are offline — messages will be sent when you reconnect."
//   error        → red banner: "Connection failed. Please refresh the page."
//
// HOW TO USE:
//   Place <ConnectionBanner /> somewhere near the top of ChatShell.tsx.
//   It renders nothing when the connection is fine.
//
// ─────────────────────────────────────────────────────────────────────────────

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);

  if (status === "connected") return null;  // all good — show nothing

  const isReconnecting = status === "reconnecting";
  const isError        = status === "error";

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium
                  text-center select-none ${
        isReconnecting
          ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300"
          : "bg-destructive/10 text-destructive"
      }`}
    >
      {isReconnecting ? (
        <>
          <RefreshCw size={12} className="animate-spin" />
          Reconnecting…
        </>
      ) : isError ? (
        <>
          <WifiOff size={12} />
          Connection failed. Please refresh the page.
        </>
      ) : (
        <>
          <Wifi size={12} />
          You are offline — messages will be sent when you reconnect.
        </>
      )}
    </div>
  );
}