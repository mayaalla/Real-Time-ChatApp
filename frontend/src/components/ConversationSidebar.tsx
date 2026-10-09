import { useState, useEffect }       from "react";
import { useAuthStore }              from "../store/authStore";
import { useConversationStore }      from "../store/conversationStore";
import { fetchConversations }        from "../api/conversations.api";
import { ConversationItem }          from "./ConversationItem";
import { NewChatDialog }             from "./NewChatDialog";
import { EmptyState }                from "./EmptyState";
import { usePresenceStore } from "../stores/presenceStore";
import { useTypingStore } from "../stores/typingStore";
import { useLogout } from "../hooks/useLogout";
import { LogOut } from "lucide-react";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// The entire left panel:
//   TOP    → search input + "New Chat" button
//   MIDDLE → filtered, scrollable conversation list
//   BOTTOM → logged-in user's name + avatar
//
// Data flow:
//   1. On mount: fetches conversations from REST API → stores in Zustand.
//   2. Socket events (from useConversationSocket — wired in Step 21.5C) update
//      the Zustand store → this component re-renders automatically.
//   3. The search box filters the already-loaded list (no new API call).
//
// ─────────────────────────────────────────────────────────────────────────────

export function ConversationSidebar() {
  const token        = useAuthStore((s) => s.accessToken);
  const currentUser  = useAuthStore((s) => s.user);
  const { conversations, setAll } = useConversationStore();
  const presenceMap = usePresenceStore((s) => s.presenceMap);
  const typingMap = useTypingStore((s) => s.typingMap);
  const { logout } = useLogout();

  const [searchQuery, setSearchQuery]   = useState("");
  const [showDialog,  setShowDialog]    = useState(false);
  const [loading,     setLoading]       = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ── Fetch conversation list once on mount ─────────────────────────────────
  useEffect(() => {
    // Don't attempt the fetch until the session has been restored
    if (!token) return;
    let cancelled = false;

    fetchConversations(token)
      .then((list) => { if (!cancelled) setAll(list); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, setAll]);

  // ── Guard: session not yet restored → render nothing ─────────────────────
  // PrivateRoute shows <LoadingScreen /> during this window, but as a
  // belt-and-suspenders safety net we bail out here too so we never try to
  // read properties off a null user/token.
  if (!currentUser || !token) return null;

  // ── Filter by search query (client-side, instant) ─────────────────────────
  const filtered = conversations.filter((c) =>
    c.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── Header: title + new chat button ─────────────────────────────────*/}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "16px 16px 8px",
          flexShrink:     0,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "1.125rem" }}>Messages</span>
        <button
          onClick={() => setShowDialog(true)}
          title="New conversation"
          aria-label="New conversation"
          style={{
            width:        "32px",
            height:       "32px",
            borderRadius: "50%",
            border:       "none",
            background:   "var(--primary)",
            color:        "var(--primary-foreground)",
            fontSize:     "1.25rem",
            cursor:       "pointer",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            lineHeight:   1,
          }}
        >
          +
        </button>
      </div>

      {/* ── Search box ───────────────────────────────────────────────────────*/}
      <div style={{ padding: "0 12px 8px", flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search conversations…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width:        "100%",
            padding:      "8px 12px",
            borderRadius: "var(--radius-md)",
            border:       "1px solid var(--border)",
            background:   "var(--input)",
            color:        "var(--foreground)",
            fontSize:     "0.875rem",
            outline:      "none",
            boxSizing:    "border-box",
          }}
        />
      </div>

      {/* ── Conversation list (scrollable) ───────────────────────────────────*/}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {loading && (
          <p style={{ padding: "16px", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
            Loading…
          </p>
        )}

        {/* Empty state: no conversations at all (not searching) */}
        {!loading && conversations.length === 0 && !searchQuery && (
          <EmptyState variant="no-conversations" />
        )}

        {/* Empty state: search returned nothing */}
        {!loading && searchQuery && filtered.length === 0 && (
          <p style={{ padding: "16px", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
            No conversations match your search.
          </p>
        )}

        {filtered.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            currentUserId={currentUser.id}
            isOnline={!conv.isGroup && conv.participants.some(
              (p) => p.id !== currentUser.id && presenceMap.get(p.id)?.online,
            )}
            typingUsernames={conv.participants
              .filter((p) => p.id !== currentUser.id && (typingMap.get(conv.id) ?? []).includes(p.id))
              .map((p) => p.username)}
          />
        ))}
      </div>

      {/* ── Footer: current user ─────────────────────────────────────────────*/}
      <div
        style={{
          padding:     "12px 16px",
          borderTop:   "1px solid var(--border)",
          display:     "flex",
          alignItems:  "center",
          gap:         "10px",
          flexShrink:  0,
        }}
      >
        {currentUser.avatarAddress ? (
          <img
            src={currentUser.avatarAddress}
            alt={currentUser.username}
            style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width:          32,
              height:         32,
              borderRadius:   "50%",
              background:     "var(--secondary)",
              color:          "var(--secondary-foreground)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontWeight:     600,
              fontSize:       "0.75rem",
            }}
          >
            {(currentUser.username?.[0] ?? "?").toUpperCase()}
          </div>
        )}
        <span className="flex-1 min-w-0 truncate" style={{ fontWeight: 600, fontSize: "0.875rem" }}>
          {currentUser.username}
        </span>
        <button
          type="button"
          onClick={async () => {
            setIsLoggingOut(true);
            try {
              await logout();
            } finally {
              setIsLoggingOut(false);
            }
          }}
          disabled={isLoggingOut}
          aria-label="Log out"
          className="flex items-center gap-1.5 shrink-0 rounded-lg px-2 py-1.5 text-sm
                     text-muted-foreground hover:bg-secondary hover:text-foreground
                     transition-colors disabled:opacity-50 disabled:cursor-wait"
        >
          <LogOut size={16} aria-hidden="true" />
          {isLoggingOut ? "Logging out…" : "Log out"}
        </button>
      </div>

      {/* ── New chat dialog (portal-style overlay) ──────────────────────────*/}
      {showDialog && <NewChatDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
}
