// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Contains the HTTP call for fetching message history.
// Uses the configured axios instance so the auth interceptor handles
// token attachment and silent 401-refresh automatically.
//
// ─────────────────────────────────────────────────────────────────────────────

import { api } from "../lib/axios";

// ─── Message shape ────────────────────────────────────────────────────────────
// NOTE: the backend Prisma column is `attachmentAddress: String[]`.
//       We normalise it here to `attachments` for convenience, but the raw
//       API response key is `attachmentAddress` — see fetchMessages below.
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  textBody: string | null;
  /** Normalised from the backend's `attachmentAddress` field. */
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

// Raw shape of a single message as the backend sends it.
interface RawMessage {
  id: string;
  conversationId: string;
  senderId: string;
  textBody: string | null;
  attachmentAddress: string[];   // ← backend column name
  status: Message["status"];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender?: Message["sender"];
}

/** Map one raw backend message to the frontend Message shape. */
function normalise(raw: RawMessage): Message {
  const { attachmentAddress, ...rest } = raw;
  return {
    ...rest,
    attachments: attachmentAddress ?? [],  // guard against missing field
    ...(raw.deletedAt ? { textBody: null, attachments: [] } : {}),
  };
}

export async function editMessage(messageId: string, textBody: string): Promise<Message> {
  const { data } = await api.patch<{ data: { message: RawMessage } }>(
    `/api/conversations/messages/${encodeURIComponent(messageId)}`, { textBody },
  );
  return normalise(data.data.message);
}

export async function deleteMessage(messageId: string): Promise<Message> {
  const { data } = await api.delete<{ data: { message: RawMessage } }>(
    `/api/conversations/messages/${encodeURIComponent(messageId)}`,
  );
  return normalise(data.data.message);
}

// fetchMessages — fetches one page of message history via the axios instance.
// The axios interceptor automatically attaches the Bearer token and handles
// silent token refresh on 401 — no manual token argument needed.
export async function fetchMessages(
  conversationId: string,
  _token: string,          // kept for backwards-compat with useMessageHistory
  cursor?: string,
  limit = 50
): Promise<MessagesPage> {
  const params: Record<string, string> = { limit: String(limit) };
  if (cursor) params.cursor = cursor;

  const { data } = await api.get<{
    ok: boolean;
    data: { messages: RawMessage[]; nextCursor: string | null; hasMore: boolean };
  }>(`/api/conversations/${conversationId}/messages`, { params });

  return {
    messages:   data.data.messages.map(normalise),
    nextCursor: data.data.nextCursor,
    hasMore:    data.data.hasMore,
  };
}

