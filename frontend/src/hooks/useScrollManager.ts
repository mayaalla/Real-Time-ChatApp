import { useRef, useCallback } from "react";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Manages all four scroll situations for the chat window.
//
// RETURNS:
//   containerRef    → attach to the scrollable <div> as  ref={containerRef}
//   scrollToBottom  → call with animate=false for first load, animate=true for new msg
//   isAtBottom()    → returns true if the user is within 80px of the bottom
//   captureHeight() → call BEFORE inserting older messages — saves the scrollHeight
//   restoreHeight() → call AFTER inserting older messages — restores the position
//
// ─────────────────────────────────────────────────────────────────────────────

const BOTTOM_THRESHOLD = 80; // pixels

export function useScrollManager() {
  const containerRef      = useRef<HTMLDivElement>(null);
  const savedScrollHeight = useRef<number>(0);

  // ── isAtBottom ─────────────────────────────────────────────────────────────
  const isAtBottom = useCallback((): boolean => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
  }, []);

  // ── scrollToBottom ─────────────────────────────────────────────────────────
  // animate=false → instant jump  (Situation 1)
  // animate=true  → smooth scroll (Situation 2)
  const scrollToBottom = useCallback((animate: boolean = false) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top:      el.scrollHeight,
      behavior: animate ? "smooth" : "instant",
    });
  }, []);

  // ── captureHeight ──────────────────────────────────────────────────────────
  // Call BEFORE React inserts new DOM nodes (older messages at the top).
  const captureHeight = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    savedScrollHeight.current = el.scrollHeight;
  }, []);

  // ── restoreHeight ──────────────────────────────────────────────────────────
  // Call AFTER React has inserted the new DOM nodes.
  // Adjusts scrollTop by the difference so visible content does not move.
  const restoreHeight = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const heightDiff = el.scrollHeight - savedScrollHeight.current;
    el.scrollTop += heightDiff;
  }, []);

  return { containerRef, scrollToBottom, isAtBottom, captureHeight, restoreHeight };
}
