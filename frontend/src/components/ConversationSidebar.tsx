import { useState, useEffect }       from "react";
import { useAuthStore }              from "../store/authStore";
import { useConversationStore }      from "../store/conversationStore";
import { fetchConversations }        from "../api/conversations.api";
import { ConversationItem }          from "./ConversationItem";
import { NewChatDialog }             from "./NewChatDialog";

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

  const [searchQuery, setSearchQuery]   = useState("");
  const [showDialog,  setShowDialog]    = useState(false);
  const [loading,     setLoading]       = useState(true);

  // ── Fetch conversation list once on mount ─────────────────────────────────
  useEffect(() => {
    // Don't attempt the fetch until the session has been restored
    if (!token) return;

    fetchConversations(token)
      .then((list) => setAll(list as Parameters<typeof setAll>[0]))
      .catch(console.error)
      .finally(() => setLoading(false));
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
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && (
          <p style={{ padding: "16px", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
            Loading…
          </p>
        )}

        {!loading && filtered.length === 0 && (
          <p style={{ padding: "16px", color: "var(--muted-foreground)", fontSize: "0.875rem" }}>
            {searchQuery ? "No conversations match your search." : "No conversations yet. Start one!"}
          </p>
        )}

        {filtered.map((conv) => (
          <ConversationItem
            key={conv.id}
            conversation={conv}
            currentUserId={currentUser.id}
            // isOnline and typingUsernames will be wired in Step 21.5C
            // (from the socket/presence store). For now they default to false/[].
            isOnline={false}
            typingUsernames={[]}
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
        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
          {currentUser.username}
        </span>
      </div>

      {/* ── New chat dialog (portal-style overlay) ──────────────────────────*/}
      {showDialog && <NewChatDialog onClose={() => setShowDialog(false)} />}
    </div>
  );
}