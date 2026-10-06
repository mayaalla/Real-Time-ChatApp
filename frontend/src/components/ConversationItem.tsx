import { useNavigate, useParams } from "react-router-dom";
import { relativeTime }           from "../utils/time";
import { buildPreview, senderLabel } from "../utils/messagePreview";
import { useConversationStore }   from "../store/conversationStore";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// One row in the conversation list. It receives everything it needs as props —
// it does NOT fetch data itself. The parent (ConversationSidebar) passes the data.
//
// PROPS:
//   conversation  → the Conversation object from the backend (see frontend_context §2.2)
//   currentUserId → the logged-in user's ID (to label "You:" on your own messages)
//   isOnline      → is the other person currently online? (for DMs, from presence store)
//   typingUsernames → list of usernames currently typing in this conversation
//
// ─────────────────────────────────────────────────────────────────────────────

// The shape of a conversation row (matches backend §2.2 of frontend_context.txt)
interface Conversation {
  id:             string;
  isGroup:        boolean;
  displayName:    string;
  displayPicture: string | null;
  lastMessage: {
    textBody:   string | null;
    senderId:   string;
    createdAt:  string;
    deletedAt?: string | null;
  } | null;
  unreadCount:  number;
  participants: Array<{ id: string; username: string }>;
}

interface Props {
  conversation:    Conversation;
  currentUserId:   string;
  isOnline?:       boolean;
  typingUsernames?: string[];
}

export function ConversationItem({ conversation, currentUserId, isOnline, typingUsernames }: Props) {
  const navigate = useNavigate();
  const { conversationId: activeId } = useParams<{ conversationId?: string }>();

  const isActive = activeId === conversation.id;
  const isTyping = !!typingUsernames && typingUsernames.length > 0;

  // ── Build the preview text ───────────────────────────────────────────────────
  const previewText = buildPreview(conversation.lastMessage ?? null);
  const sender      = conversation.lastMessage
    ? senderLabel(
        conversation.lastMessage.senderId,
        currentUserId,
        conversation.participants.find(
          (p) => p.id === conversation.lastMessage!.senderId
        )?.username,
      )
    : "";

  const preview = previewText
    ? (sender ? `${sender}: ${previewText}` : previewText)
    : "";

  // ── Build the avatar initials (used when there is no picture) ──────────────
  const initials = conversation.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  // ── Handle click: navigate to this conversation ────────────────────────────
  const clearUnread = useConversationStore((s) => s.clearUnread);

  const handleClick = () => {
    // Optimistically clear the badge the moment the user clicks
    clearUnread(conversation.id);
    // Then navigate to the conversation
    navigate(`/c/${conversation.id}`);
  };

  return (
    <button
      onClick={handleClick}
      style={{
        display:         "flex",
        alignItems:      "center",
        gap:             "12px",
        padding:         "12px 16px",
        width:           "100%",
        textAlign:       "left",
        border:          "none",
        borderRadius:    "0",
        cursor:          "pointer",
        background:      isActive ? "var(--accent)" : "transparent",
        color:           isActive ? "var(--accent-foreground)" : "var(--foreground)",
        transition:      "background 0.15s",
      }}
    >
      {/* ── Avatar ──────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {conversation.displayPicture ? (
          <img
            src={conversation.displayPicture}
            alt={conversation.displayName}
            style={{
              width:        "44px",
              height:       "44px",
              borderRadius: "50%",
              objectFit:    "cover",
            }}
          />
        ) : (
          <div
            style={{
              width:           "44px",
              height:          "44px",
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
            {initials}
          </div>
        )}

        {/* ── Online dot (DM only) ─────────────────────────────────────────── */}
        {!conversation.isGroup && isOnline && (
          <span
            style={{
              position:     "absolute",
              bottom:       "2px",
              right:        "2px",
              width:        "10px",
              height:       "10px",
              borderRadius: "50%",
              background:   "#22c55e",           // green
              border:       "2px solid var(--background)",
            }}
          />
        )}
      </div>

      {/* ── Text content ──────────────────────────────────────────────────────*/}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name row */}
        <div
          style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "baseline",
            gap:            "8px",
          }}
        >
          <span
            style={{
              fontWeight:    600,
              fontSize:      "0.9375rem",
              whiteSpace:    "nowrap",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
            }}
          >
            {conversation.displayName}
          </span>

          {/* Time */}
          <span
            style={{
              fontSize:   "0.75rem",
              flexShrink: 0,
              color:      isActive
                ? "var(--accent-foreground)"
                : "var(--muted-foreground)",
            }}
          >
            {relativeTime(conversation.lastMessage?.createdAt ?? null)}
          </span>
        </div>

        {/* Preview row */}
        <div
          style={{
            display:        "flex",
            justifyContent: "space-between",
            alignItems:     "center",
            gap:            "8px",
            marginTop:      "2px",
          }}
        >
          {/* Typing indicator OR last message preview */}
          <span
            style={{
              fontSize:      "0.8125rem",
              color:         isTyping
                ? "var(--primary)"
                : isActive
                  ? "var(--accent-foreground)"
                  : "var(--muted-foreground)",
              whiteSpace:    "nowrap",
              overflow:      "hidden",
              textOverflow:  "ellipsis",
              fontStyle:     isTyping ? "italic" : "normal",
            }}
          >
            {isTyping
              ? typingUsernames!.length === 1
                ? `${typingUsernames![0]} is typing…`
                : "Several people are typing…"
              : preview}
          </span>

          {/* Unread badge */}
          {conversation.unreadCount > 0 && (
            <span
              style={{
                background:    "var(--primary)",
                color:         "var(--primary-foreground)",
                borderRadius:  "9999px",
                fontSize:      "0.6875rem",
                fontWeight:    700,
                minWidth:      "18px",
                height:        "18px",
                padding:       "0 5px",
                display:       "flex",
                alignItems:    "center",
                justifyContent:"center",
                flexShrink:    0,
              }}
            >
              {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}