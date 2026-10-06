import { useState, useEffect } from "react";
import { useNavigate }         from "react-router-dom";
import { useAuthStore }        from "../store/authStore";
import { useDebounce }         from "../hooks/useDebounce";
import { searchUsers }         from "../api/users.api";
import { createConversation }  from "../api/conversations.api";
import type { PublicUser }     from "../api/users.api";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// A modal dialog for starting a new conversation.
// FLOW:
//   1. User types a name → debounced search calls GET /api/users?search=...
//   2. Results appear below the input.
//   3. Clicking one person → DM created → dialog closes → that chat opens.
//   4. Clicking a second/third person adds them to a "group" list.
//      A group-name field appears. On confirm → group created → chat opens.
//
// PROPS:
//   onClose → callback to close/hide this dialog from the parent
//
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
}

export function NewChatDialog({ onClose }: Props) {
  const navigate    = useNavigate();
  const token       = useAuthStore((s) => s.accessToken)!;
  const currentUser = useAuthStore((s) => s.user)!;

  // ── State ────────────────────────────────────────────────────────────────────
  const [query,     setQuery]     = useState("");                   // raw input
  const [results,   setResults]   = useState<PublicUser[]>([]);     // search results
  const [selected,  setSelected]  = useState<PublicUser[]>([]);     // chosen people
  const [groupName, setGroupName] = useState("");                   // group chat name
  const [busy,      setBusy]      = useState(false);                // creating conversation
  const [error,     setError]     = useState<string | null>(null);

  // Debounced query — only fires the search 400ms after typing stops
  const debouncedQuery = useDebounce(query, 400);

  // ── Search effect ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      return;
    }
    // Call the API. Ignore results if the component unmounts before they arrive.
    let cancelled = false;
    searchUsers(debouncedQuery, token).then((users) => {
      if (!cancelled) {
        // Filter out the current user and already-selected users from results
        setResults(
          users.filter(
            (u) => u.id !== currentUser.id && !selected.find((s) => s.id === u.id)
          )
        );
      }
    });
    return () => { cancelled = true; };
  }, [debouncedQuery, token, currentUser.id, selected]);

  // ── Add / remove from selection ───────────────────────────────────────────────
  const toggleSelect = (user: PublicUser) => {
    setSelected((prev) =>
      prev.find((u) => u.id === user.id)
        ? prev.filter((u) => u.id !== user.id)   // remove if already in
        : [...prev, user]                          // add if not in
    );
  };

  const isGroup = selected.length > 1;

  // ── Create the conversation ───────────────────────────────────────────────────
  const handleCreate = async () => {
    if (selected.length === 0) return;
    if (isGroup && !groupName.trim()) {
      setError("Please enter a group name.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const conversation = await createConversation(
        token,
        selected.map((u) => u.id),
        isGroup,
        isGroup ? groupName.trim() : undefined,
      );
      onClose();
      navigate(`/c/${conversation.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    // Backdrop — clicking it closes the dialog
    <div
      onClick={onClose}
      style={{
        position:       "fixed",
        inset:          0,
        background:     "rgba(0,0,0,0.4)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        zIndex:         50,
      }}
    >
      {/* Dialog box — stop click from closing when clicking inside */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:   "var(--card)",
          color:        "var(--card-foreground)",
          borderRadius: "var(--radius)",
          padding:      "24px",
          width:        "min(480px, 90vw)",
          maxHeight:    "80vh",
          display:      "flex",
          flexDirection:"column",
          gap:          "16px",
          boxShadow:    "var(--shadow-lg)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
          New conversation
        </h2>

        {/* Search input */}
        <input
          autoFocus
          type="text"
          placeholder="Search by username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            padding:      "8px 12px",
            borderRadius: "var(--radius-md)",
            border:       "1px solid var(--border)",
            background:   "var(--input)",
            color:        "var(--foreground)",
            fontSize:     "0.9375rem",
            outline:      "none",
          }}
        />

        {/* Selected people chips */}
        {selected.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {selected.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleSelect(u)}
                style={{
                  padding:      "4px 10px",
                  borderRadius: "9999px",
                  border:       "none",
                  background:   "var(--accent)",
                  color:        "var(--accent-foreground)",
                  cursor:       "pointer",
                  fontSize:     "0.8125rem",
                }}
              >
                {u.username} ✕
              </button>
            ))}
          </div>
        )}

        {/* Group name field (only when 2+ selected) */}
        {isGroup && (
          <input
            type="text"
            placeholder="Group name…"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            maxLength={60}
            style={{
              padding:      "8px 12px",
              borderRadius: "var(--radius-md)",
              border:       "1px solid var(--border)",
              background:   "var(--input)",
              color:        "var(--foreground)",
              fontSize:     "0.9375rem",
              outline:      "none",
            }}
          />
        )}

        {/* Search results */}
        <div style={{ overflowY: "auto", flex: 1 }}>
          {results.map((user) => (
            <button
              key={user.id}
              onClick={() => toggleSelect(user)}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          "10px",
                width:        "100%",
                padding:      "8px 4px",
                border:       "none",
                borderRadius: "var(--radius-md)",
                background:   "transparent",
                color:        "var(--foreground)",
                cursor:       "pointer",
                textAlign:    "left",
              }}
            >
              {user.avatarAddress ? (
                <img
                  src={user.avatarAddress}
                  alt={user.username}
                  style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width:           36,
                    height:          36,
                    borderRadius:    "50%",
                    background:      "var(--secondary)",
                    color:           "var(--secondary-foreground)",
                    display:         "flex",
                    alignItems:      "center",
                    justifyContent:  "center",
                    fontWeight:      600,
                    fontSize:        "0.875rem",
                  }}
                >
                  {user.username[0]?.toUpperCase()}
                </div>
              )}
              <span style={{ fontWeight: 500 }}>{user.username}</span>
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <p style={{ margin: 0, color: "var(--destructive)", fontSize: "0.875rem" }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding:      "8px 16px",
              borderRadius: "var(--radius-md)",
              border:       "1px solid var(--border)",
              background:   "transparent",
              color:        "var(--foreground)",
              cursor:       "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={busy || selected.length === 0}
            style={{
              padding:      "8px 16px",
              borderRadius: "var(--radius-md)",
              border:       "none",
              background:   "var(--primary)",
              color:        "var(--primary-foreground)",
              cursor:       busy || selected.length === 0 ? "not-allowed" : "pointer",
              opacity:      busy || selected.length === 0 ? 0.6 : 1,
            }}
          >
            {busy ? "Creating…" : isGroup ? "Create group" : "Open chat"}
          </button>
        </div>
      </div>
    </div>
  );
}
