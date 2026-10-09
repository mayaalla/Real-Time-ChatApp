import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown } from "lucide-react";
import { useAuthStore }         from "../../store/authStore";
import { useConversationStore } from "../../store/conversationStore";
import { useConnectionStore }   from "../../store/connectionStore";
import { useMessageHistory }    from "../../hooks/useMessageHistory";
import { useScrollManager }     from "../../hooks/useScrollManager";
import { useReadReceipts }      from "../../hooks/useReadReceipts";
import { MessageListSkeleton }  from "./MessageListSkeleton";
import { EmptyConversation }    from "./EmptyConversation";
import { MessageBubble }        from "./MessageBubble";
import { buildMessageGroups }   from "../../utils/messageGrouping";
import { mergeMessage } from "../../utils/messageCache";
import { type Message }         from "../../api/messages.api";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// The scrollable message area. Handles all four scroll situations:
//   1. First load  → jump to bottom instantly
//   2. New message, user is at bottom → scroll smoothly
//   3. New message, user scrolled up  → show "↓ New messages" pill
//   4. User scrolls to top → load older messages, preserve scroll position
//
// Also:
//   - Merges REST history (from useMessageHistory) with live socket messages
//   - Registers useReadReceipts so message:read events are sent automatically
//   - Announces new messages to screen readers via aria-live="polite"
//
// ─────────────────────────────────────────────────────────────────────────────

interface MessageListProps {
  conversationId:   string;
  conversationName: string;
  isGroup:          boolean;
  liveMessages:     Message[];
  onMessageChange: (message: Message) => void;
}

export function MessageList({
  conversationId,
  conversationName,
  isGroup,
  liveMessages,
  onMessageChange,
}: MessageListProps) {
  const currentUser      = useAuthStore((s) => s.user);
  const participants = useConversationStore((s) =>
    s.conversations.find((conversation) => conversation.id === conversationId)?.participants,
  );
  const connectionStatus = useConnectionStore((s) => s.status);
  const isConnected      = connectionStatus === "connected";

  const { messages, isLoading, isFetchingMore, hasMore, loadMore } =
    useMessageHistory(conversationId);

  const { containerRef, scrollToBottom, isAtBottom, captureHeight, restoreHeight } =
    useScrollManager();

  // Sends message:read events when messages are visible and the tab is focused.
  const { observeMessage, unobserveMessage } = useReadReceipts({
    conversationId,
    isConnected,
  });

  const [showNewPill, setShowNewPill] = useState(false);
  const isFirstLoad    = useRef(true);
  const prevLiveCount  = useRef(0);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // ── Merge REST history with live socket messages, de-duplicate by id ─────
  const historyIds  = new Set(messages.map((m) => m.id));
  const liveById = new Map(liveMessages.map((m) => [m.id, m]));
  const allMessages = [
    ...messages.map((m) => {
      const live = liveById.get(m.id);
      return live ? mergeMessage(live, m) : m;
    }),
    ...liveMessages.filter((m) => !historyIds.has(m.id)),
  ];

  // Build display groups (date dividers + consecutive-run metadata).
  const groups = buildMessageGroups(allMessages, currentUser?.id);

  // ── SITUATION 1: First load → jump to bottom instantly ───────────────────
  useEffect(() => {
    if (!isLoading && isFirstLoad.current) {
      isFirstLoad.current = false;
      setTimeout(() => scrollToBottom(false), 0);
    }
  }, [isLoading, scrollToBottom]);

  // ── SITUATION 2 & 3: New live message arrived ─────────────────────────────
  useEffect(() => {
    if (liveMessages.length <= prevLiveCount.current) return;
    prevLiveCount.current = liveMessages.length;
    if (isFirstLoad.current) return;

    if (isAtBottom()) {
      scrollToBottom(true);
    } else {
      const frame = requestAnimationFrame(() => setShowNewPill(true));
      return () => cancelAnimationFrame(frame);
    }
  }, [liveMessages.length, isAtBottom, scrollToBottom]);

  // ── SITUATION 4: Loading older messages → preserve scroll position ────────
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingMore) {
          captureHeight();
          loadMore().then(() => {
            restoreHeight();
          });
        }
      },
      { root: containerRef.current, threshold: 0 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, loadMore, captureHeight, restoreHeight, containerRef]);

  const handlePillClick = useCallback(() => {
    scrollToBottom(true);
    setShowNewPill(false);
  }, [scrollToBottom]);

  const handleScroll = useCallback(() => {
    if (isAtBottom()) setShowNewPill(false);
  }, [isAtBottom]);

  // ── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) return <MessageListSkeleton />;

  if (allMessages.length === 0) {
    return <EmptyConversation name={conversationName} />;
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">

      {/* The scrollable container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        // aria-live="polite" → screen reader finishes what it's saying, THEN
        // announces new messages. "assertive" would interrupt — bad for chat.
        aria-live="polite"
        aria-label="Message history"
        role="log"
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1"
        style={{ overscrollBehavior: "contain" }}
      >
        {/* Sentinel: becomes visible when the user scrolls to the very top */}
        <div ref={topSentinelRef} className="h-px shrink-0" />

        {/* Loading spinner for older pages */}
        {isFetchingMore && (
          <div className="flex justify-center py-3">
            <div className="w-5 h-5 rounded-full border-2 border-muted
                            border-t-primary animate-spin" />
          </div>
        )}

        {/* "Beginning of history" label */}
        {!hasMore && allMessages.length > 0 && (
          <p className="text-center text-xs text-muted-foreground py-2">
            Beginning of conversation
          </p>
        )}

        {/* Render date dividers and message bubbles */}
        {groups.map((item, i) => {
          if (item.type === "date-divider") {
            return (
              <div
                key={`divider-${item.label}-${i}`}
                className="flex items-center gap-3 my-3"
              >
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground px-2">
                  {item.label}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            );
          }

          const isOwn = item.isOwn;
          // Optimistic messages already have a senderId but no server profile yet.
          const profile = item.message.sender ?? (isOwn ? currentUser :
            participants?.find((p) => p.id === item.message.senderId));
          const sender = profile ? {
            id: profile.id,
            username: profile.username,
            avatarAddress: profile.avatarAddress ?? null,
            lastSeen: profile.lastSeen ?? null,
          } : undefined;
          return (
            <MessageBubble
              key={item.message.id}
              message={{ ...item.message, sender }}
              isOwn={isOwn}
              showSenderInfo={isGroup || item.showSenderInfo}
              isGroup={isGroup}
              onMessageChange={onMessageChange}
              // Pass read-receipt callbacks ONLY for other people's messages.
              // The hook uses these to observe/unobserve DOM elements.
              onVisible={isOwn ? undefined : observeMessage}
              onHidden={isOwn ? undefined  : unobserveMessage}
            />
          );
        })}
      </div>

      {/* "↓ New messages" pill — Situation 3 */}
      {showNewPill && (
        <button
          onClick={handlePillClick}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10
                     flex items-center gap-1.5 px-4 py-2 rounded-full
                     bg-primary text-primary-foreground text-sm font-medium
                     shadow-md hover:opacity-90 transition-opacity"
        >
          <ArrowDown size={14} />
          New messages
        </button>
      )}
    </div>
  );
}
