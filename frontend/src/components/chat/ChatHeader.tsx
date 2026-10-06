import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeft, Users } from "lucide-react";
import { useAuthStore }     from "../../store/authStore";
import { usePresenceStore } from "../../stores/presenceStore";
import { useTypingStore }   from "../../stores/typingStore";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Renders the top bar of the open chat window.
// It reacts live to presence and typing changes from the Zustand stores.
// No network calls here — just reads state.
//
// ─────────────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  username: string;
  avatarAddress: string | null;
  lastSeen: string | null;
}

interface Conversation {
  id: string;
  isGroup: boolean;
  displayName: string;
  displayPicture: string | null;
  participants: Participant[];
}

interface ChatHeaderProps {
  conversation: Conversation;
  onBack?: () => void;   // called when the back arrow is pressed (mobile only)
}

export function ChatHeader({ conversation, onBack }: ChatHeaderProps) {
  const currentUser  = useAuthStore((s) => s.user);
  const presenceMap  = usePresenceStore((s) => s.presenceMap);
  const typingMap    = useTypingStore((s) => s.typingMap);
  const [showMembers, setShowMembers] = useState(false);

  // ── Who is typing in this conversation? ─────────────────────────────────────
  // Filter out ourselves — we only show OTHERS typing.
  const typerIds = (typingMap.get(conversation.id) ?? []).filter(
    (id) => id !== currentUser?.id
  );

  // ── The other person in a DM ─────────────────────────────────────────────────
  const otherPerson = !conversation.isGroup
    ? conversation.participants.find((p) => p.id !== currentUser?.id)
    : null;

  // ── Build the status line ────────────────────────────────────────────────────
  function getStatusLine(): string {
    if (conversation.isGroup) {
      return `${conversation.participants.length} members`;
    }

    // DM: Check typing first (highest priority).
    if (typerIds.length > 0) return "typing…";

    // Then check online/offline from presence store.
    const presence = otherPerson ? presenceMap.get(otherPerson.id) : undefined;
    if (presence?.online) return "online";

    // Last resort: show when they were last seen.
    const lastSeen = presence?.lastSeen ?? otherPerson?.lastSeen;
    if (lastSeen) {
      return `last seen ${formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}`;
    }

    return "offline";
  }

  const statusLine = getStatusLine();
  const isTyping   = typerIds.length > 0;
  const isOnline   = !conversation.isGroup &&
                     presenceMap.get(otherPerson?.id ?? "")?.online === true;

  return (
    <header className="flex items-center gap-3 px-4 py-3 border-b border-border
                       bg-card shadow-sm relative">

      {/* Back arrow — mobile only */}
      {onBack && (
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="text-muted-foreground hover:text-foreground transition-colors md:hidden"
        >
          <ArrowLeft size={22} />
        </button>
      )}

      {/* Avatar */}
      <div className="relative shrink-0">
        {conversation.displayPicture ? (
          <img
            src={conversation.displayPicture}
            alt={conversation.displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-accent flex items-center
                          justify-center text-accent-foreground font-semibold text-sm">
            {conversation.displayName.charAt(0).toUpperCase()}
          </div>
        )}

        {/* Online dot for DMs */}
        {isOnline && (
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full
                           bg-green-500 border-2 border-card" />
        )}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate leading-tight">
          {conversation.displayName}
        </p>
        <p
          className={`text-xs truncate leading-tight ${
            isTyping
              ? "text-primary italic"
              : statusLine === "online"
              ? "text-green-500"
              : "text-muted-foreground"
          }`}
        >
          {statusLine}
        </p>
      </div>

      {/* Group member count button */}
      {conversation.isGroup && (
        <button
          onClick={() => setShowMembers((v) => !v)}
          aria-label="Show members"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Users size={20} />
        </button>
      )}

      {/* Member list panel */}
      {showMembers && conversation.isGroup && (
        <div className="absolute top-16 right-4 z-50 bg-card border border-border
                        rounded-xl shadow-lg p-3 w-56 max-h-72 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Members
          </p>
          {conversation.participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1.5">
              {p.avatarAddress ? (
                <img src={p.avatarAddress} alt={p.username}
                     className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-secondary flex items-center
                                justify-center text-xs font-semibold shrink-0">
                  {p.username.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-sm text-foreground truncate flex-1">
                {p.username}
              </span>
              {presenceMap.get(p.id)?.online && (
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              )}
            </div>
          ))}
        </div>
      )}

    </header>
  );
}
