// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Contains the HTTP call for fetching message history.
// Used by useInfiniteQuery in Step 22.2.
//
// ─────────────────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL as string;

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  textBody: string | null;
  attachments: string[];
  status: "SENT" | "DELIVERED" | "READ" | "PENDING" | "FAILED";
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender?: {
    id: string;
    username: string;
    avatarAddress: string | null;
    lastSeen: string | null;
  };
}

export interface MessagesPage {
  messages: Message[];
  nextCursor: string | null;
  hasMore: boolean;
}

// fetchMessages — fetches one page of message history.
// cursor is the ISO-datetime string the previous page returned as nextCursor.
// Pass undefined for the very first load (no cursor = newest 50 messages).
export async function fetchMessages(
  conversationId: string,
  token: string,
  cursor?: string,
  limit = 50
): Promise<MessagesPage> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);

  const res = await fetch(
    `${API}/api/conversations/${conversationId}/messages?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    }
  );

  if (!res.ok) throw new Error("Failed to load messages");

  const json = await res.json();
  return json.data as MessagesPage;
}
