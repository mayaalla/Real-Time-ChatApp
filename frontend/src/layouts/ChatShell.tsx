import { Outlet, useParams } from "react-router-dom";
import { ConversationSidebar } from "../components/ConversationSidebar";
import { ConnectionBanner } from "../components/shared/ConnectionBanner";
import { useNotifications } from "../hooks/useNotifications";
import { useConversationSocket } from "../hooks/useConversationSocket";
import { socket } from "../lib/socket";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// The outer shell of the chat page.
// It renders TWO panels side by side on wide screens:
//   LEFT  → the conversation list (ConversationSidebar)
//   RIGHT → whatever child route is matched (<Outlet />)
//
// On narrow screens (< 768px), only one panel is shown at a time.
// If a conversation is open (conversationId in the URL), show the right panel.
// If no conversation is open, show the left panel.
//
// ─────────────────────────────────────────────────────────────────────────────

export function ChatShell() {
  // useParams reads the :conversationId from the URL (if present)
  const { conversationId } = useParams<{ conversationId?: string }>();

  // Tab title + sound + browser notifications for new messages.
  useNotifications();
  useConversationSocket(socket);

  // On mobile: if a conversation is open, hide the sidebar and show the chat.
  // On desktop: always show both panels.
  const sidebarHiddenOnMobile = !!conversationId; // true when a chat is open

  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",         // stack banner on top, panels below
        height:         "100dvh",         // dvh = dynamic viewport height (works on mobile too)
        overflow:       "hidden",         // the shell itself NEVER scrolls
        background:     "var(--background)",
        color:          "var(--foreground)",
      }}
    >
      {/* ── CONNECTION BANNER: shown only when socket is not connected ─────── */}
      <ConnectionBanner />

      {/* ── MAIN AREA: sidebar + chat panels side by side ─────────────────── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT PANEL: Conversation Sidebar ──────────────────────────────── */}
        <div
          style={{
            width:         "clamp(280px, 30%, 360px)", // responsive: min 280px, max 360px
            flexShrink:    0,
            borderRight:   "1px solid var(--border)",
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            // On narrow screens: hide sidebar when a conversation is open
          }}
          className={sidebarHiddenOnMobile ? "hide-on-mobile" : ""}
        >
          <ConversationSidebar />
        </div>

        {/* ── RIGHT PANEL: Chat area or empty state ─────────────────────────── */}
        <div
          style={{
            flex:          1,             // take all remaining space
            display:       "flex",
            flexDirection: "column",
            overflow:      "hidden",
            // On narrow screens: hide chat area when no conversation is open
          }}
          className={!conversationId ? "hide-on-mobile" : ""}
        >
          {/* <Outlet /> renders the matched child route.
              When path is "/"     → renders <EmptyState />
              When path is /c/:id  → renders <ChatArea conversationId={id} />  */}
          <Outlet />
        </div>

      </div>
    </div>
  );
}
