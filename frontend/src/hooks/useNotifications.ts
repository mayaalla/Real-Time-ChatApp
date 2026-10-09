import { useEffect, useRef } from "react";
import { useConversationStore } from "../store/conversationStore";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// 1. Watches the total unread count across all conversations.
// 2. Updates the browser tab title to show the count, e.g. "(3) Chat App".
// 3. When a new message arrives while the tab is NOT focused:
//      a. Shows a browser notification (if the user granted permission).
//      b. Plays a short notification sound (if the setting is enabled).
// 4. When the tab regains focus, resets the title to "Chat App".
//
// HOW TO USE:
//   Call this hook once, in ChatShell.tsx:
//     useNotifications();
//
// ─────────────────────────────────────────────────────────────────────────────

const APP_TITLE = "Chat App";

// Singleton AudioContext — created lazily on the first play call.
// Browsers only allow creation/resume AFTER a user gesture, but once the
// context has been resumed once it stays available for subsequent calls.
let _audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!_audioCtx || _audioCtx.state === "closed") {
      _audioCtx = new AudioContext();
    }
    return _audioCtx;
  } catch {
    return null;
  }
}

// A tiny in-memory notification sound using the Web Audio API.
// This avoids needing any audio file on disk.
async function playNotificationSound() {
  try {
    // Only a user gesture may create/resume the context. Background arrivals
    // stay silent until it is running instead of triggering autoplay warnings.
    const ctx = _audioCtx;
    if (!ctx || ctx.state !== "running") return;

    const oscillator = ctx.createOscillator();
    const gain       = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(880, ctx.currentTime);          // A5 note
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.08);  // E5 note
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.25);
  } catch {
    // Web Audio API not available — silently ignore.
  }
}

// Ask the user for browser notification permission (only asks once).
async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
}

// Show a browser notification.
function showBrowserNotification(title: string, body: string) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  new Notification(title, {
    body,
    tag:  "new-message",   // replaces any previous notification (prevents spam)
  });
}

export function useNotifications() {
  const conversations = useConversationStore((s) => s.conversations);
  const prevUnreadRef = useRef(0);

  // ── Total unread across all conversations ──────────────────────────────────
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);

  // ── Update browser tab title ───────────────────────────────────────────────
  useEffect(() => {
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) ${APP_TITLE}`;
    } else {
      document.title = APP_TITLE;
    }
  }, [totalUnread]);

  // ── Clear title when tab gains focus ──────────────────────────────────────
  useEffect(() => {
    const onFocus = () => {
      // The title will be updated on the next render when unread clears.
      // But we also reset it immediately as a safety net.
      if (totalUnread === 0) {
        document.title = APP_TITLE;
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [totalUnread]);

  // ── Play sound and show notification when new unread arrives ──────────────
  useEffect(() => {
    const currentUnread = totalUnread;
    const prevUnread    = prevUnreadRef.current;
    prevUnreadRef.current = currentUnread;

    // Only trigger if the count went UP (new message) AND the tab is NOT focused.
    if (currentUnread > prevUnread && !document.hasFocus()) {
      // Sound — check user setting (stored in localStorage for simplicity)
      const soundEnabled = localStorage.getItem("notifSound") !== "false";
      if (soundEnabled) {
        playNotificationSound();
      }

      // Browser notification — requires permission
      const notifEnabled = localStorage.getItem("notifBrowser") !== "false";
      if (notifEnabled) {
        showBrowserNotification(
          APP_TITLE,
          `You have ${currentUnread} unread message${currentUnread === 1 ? "" : "s"}`,
        );
      }
    }
  }, [totalUnread]);

  // Unlock sound and request notifications from an explicit user gesture.
  useEffect(() => {
    const onGesture = () => {
      if (localStorage.getItem("notifSound") !== "false") {
        const ctx = getAudioContext();
        if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
      }
      if (localStorage.getItem("notifBrowser") !== "false") {
        void requestNotificationPermission().catch(() => {});
      }
    };
    window.addEventListener("pointerdown", onGesture);
    window.addEventListener("keydown", onGesture);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);
}
