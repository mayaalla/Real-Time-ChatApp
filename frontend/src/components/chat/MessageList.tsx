import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowDown } from "lucide-react";
import { useAuthStore }         from "../../store/authStore";
import { useMessageHistory }    from "../../hooks/useMessageHistory";
import { useScrollManager }     from "../../hooks/useScrollManager";
import { MessageListSkeleton }  from "./MessageListSkeleton";
import { EmptyConversation }    from "./EmptyConversation";
import { MessageBubble }        from "./MessageBubble";
import { buildMessageGroups }   from "../../utils/messageGrouping";
import { type Message }              from "../../api/messages.api";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// The scrollable message area.
// Handles all four scroll situations.
// Merges REST history (from useMessageHistory) with live socket messages
// passed in via the liveMessages prop.
//
// ─────────────────────────────────────────────────────────────────────────────

interface MessageListProps {
  conversationId: string;
  conversationName: string;
  isGroup: boolean;
  liveMessages: Message[];  // messages that arrived via socket after REST history loaded
}

export function MessageList({
  conversationId,
  conversationName,
  isGroup,
  liveMessages,
}: MessageListProps) {
  const currentUser = useAuthStore((s) => s.user);

  const { messages, isLoading, isFetchingMore, hasMore, loadMore } =
    useMessageHistory(conversationId);

  const { containerRef, scrollToBottom, isAtBottom, captureHeight, restoreHeight } =
    useScrollManager();

  const [showNewPill, setShowNewPill] = useState(false);
  const isFirstLoad  = useRef(true);
  const prevLiveCount = useRef(0);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  // ── Merge REST history with live socket messages ──────────────────────────
  // De-duplicate by id — the socket sometimes echoes our own sends back.
  const historyIds  = new Set(messages.map((m) => m.id));
  const allMessages = [
    ...messages,
    ...liveMessages.filter((m) => !historyIds.has(m.id)),
  ];

  // Build display groups (date dividers + consecutive-run metadata).
  const groups = buildMessageGroups(allMessages, currentUser?.id);

  // ── SITUATION 1: First load → jump to bottom instantly ────────────────────
  useEffect(() => {
    if (!isLoading && isFirstLoad.current) {
      isFirstLoad.current = false;
      // Use setTimeout(0) so the DOM has painted before we measure scrollHeight.
      setTimeout(() => scrollToBottom(false), 0);
    }
  }, [isLoading, scrollToBottom]);

  // ── SITUATION 2 & 3: New live message arrived ─────────────────────────────
  useEffect(() => {
    if (liveMessages.length <= prevLiveCount.current) return;
    prevLiveCount.current = liveMessages.length;
    if (isFirstLoad.current) return; // not ready yet

    if (isAtBottom()) {
      // Situation 2: user is at the bottom → scroll smoothly.
      scrollToBottom(true);
    } else {
      // Situation 3: user is reading old messages → show pill only.
      setShowNewPill(true);
    }
  }, [liveMessages.length, isAtBottom, scrollToBottom]);

  // ── SITUATION 4: Loading older messages → preserve scroll position ─────────
  // An IntersectionObserver watches a tiny sentinel <div> at the very top.
  // When it becomes visible, the user has scrolled to the top → load more.
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !isFetchingMore) {
          captureHeight();         // Step A: record current scrollHeight
          loadMore().then(() => {
            restoreHeight();       // Step B: after DOM updates, fix scrollTop
          });
        }
      },
      { root: containerRef.current, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, loadMore, captureHeight, restoreHeight, containerRef]);

  // ── Pill click → scroll to bottom ──────────────────────────────────────────
  const handlePillClick = useCallback(() => {
    scrollToBottom(true);
    setShowNewPill(false);
  }, [scrollToBottom]);

  // ── Hide pill when user manually scrolls to the bottom ─────────────────────
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
              <div key={`divider-${item.label}-${i}`}
                   className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground px-2">
                  {item.label}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            );
          }
          return (
            <MessageBubble
              key={item.message.id}
              message={item.message}
              isOwn={item.isOwn}
              showSenderInfo={item.showSenderInfo}
              isGroup={isGroup}
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
