import { useEffect, useRef, useCallback } from "react";
import { socket } from "../lib/socket";

interface UseReadReceiptsOptions {
  conversationId: string;
  isConnected: boolean;
}

export function useReadReceipts({ conversationId, isConnected }: UseReadReceiptsOptions) {
  // Child effects can register bubbles before the observer's parent effect runs.
  const elements = useRef(new Map<string, Element>());
  const visible = useRef(new Map<string, Element>());
  const observer = useRef<IntersectionObserver | null>(null);
  const schedule = useRef<() => void>(() => {});

  const observeMessage = useCallback((messageId: string, element: Element | null) => {
    if (!element) return;
    elements.current.set(messageId, element);
    observer.current?.observe(element);
  }, []);

  const unobserveMessage = useCallback((messageId: string, element: Element | null) => {
    if (element) observer.current?.unobserve(element);
    elements.current.delete(messageId);
    visible.current.delete(messageId);
    schedule.current();
  }, []);

  useEffect(() => {
    const registeredElements = elements.current;
    const visibleElements = visible.current;
    visibleElements.clear();
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingId: string | null = null;
    let acknowledgedTime = -Infinity;
    const sentTimes = new Map<string, number>();

    function sendReadReceipt() {
      if (!isConnected || !socket.connected || !document.hasFocus() || document.visibilityState === "hidden") return;
      let newestId: string | null = null;
      let newestTime = -Infinity;
      for (const [id, element] of visibleElements) {
        const time = Date.parse((element as HTMLElement).dataset.messageTime ?? "");
        if (time > newestTime) {
          newestTime = time;
          newestId = id;
        }
      }
      if (!newestId || newestTime <= acknowledgedTime || pendingId) return;
      pendingId = newestId;
      sentTimes.set(newestId, newestTime);
      socket.emit("message:read", { conversationId, lastReadMessageId: newestId });
      retryTimer = setTimeout(() => {
        pendingId = null;
        sendReadReceipt();
      }, 5000);
    }

    function scheduleSend() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(sendReadReceipt, 400);
    }
    schedule.current = scheduleSend;

    function onReadAck(payload: { conversationId: string; lastReadMessageId: string }) {
      if (payload.conversationId !== conversationId) return;
      const time = sentTimes.get(payload.lastReadMessageId);
      if (time === undefined) return;
      acknowledgedTime = Math.max(acknowledgedTime, time);
      sentTimes.delete(payload.lastReadMessageId);
      if (pendingId === payload.lastReadMessageId) {
        pendingId = null;
        clearTimeout(retryTimer);
      }
      scheduleSend();
    }

    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        const id = element.dataset.messageId;
        if (!id) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          visibleElements.set(id, element);
        } else {
          visibleElements.delete(id);
        }
      }
      scheduleSend();
    }, { threshold: 0.5 });
    observer.current = intersectionObserver;
    for (const element of registeredElements.values()) intersectionObserver.observe(element);

    window.addEventListener("focus", scheduleSend);
    document.addEventListener("visibilitychange", scheduleSend);
    socket.on("message:read_ack", onReadAck);
    return () => {
      intersectionObserver.disconnect();
      observer.current = null;
      visibleElements.clear();
      schedule.current = () => {};
      clearTimeout(debounceTimer);
      clearTimeout(retryTimer);
      window.removeEventListener("focus", scheduleSend);
      document.removeEventListener("visibilitychange", scheduleSend);
      socket.off("message:read_ack", onReadAck);
    };
  }, [conversationId, isConnected]);

  return { observeMessage, unobserveMessage };
}
