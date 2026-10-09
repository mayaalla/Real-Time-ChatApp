import { QueryClient } from "@tanstack/react-query";
import type { Message, MessagesPage } from "../api/messages.api";

const STATUS_RANK: Record<Message["status"], number> = {
  PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: -1,
};

export function mergeMessage(existing: Message, incoming: Message): Message {
  const latestContent = Date.parse(existing.editedAt ?? existing.createdAt) >
    Date.parse(incoming.editedAt ?? incoming.createdAt) ? existing : incoming;
  const deletedAt = existing.deletedAt ?? incoming.deletedAt;
  return {
    ...existing,
    ...incoming,
    sender: incoming.sender ?? existing.sender,
    textBody: deletedAt ? null : latestContent.textBody,
    attachments: deletedAt ? [] : latestContent.attachments,
    editedAt: latestContent.editedAt,
    deletedAt,
    status: STATUS_RANK[existing.status] > STATUS_RANK[incoming.status] ? existing.status : incoming.status,
  };
}

export function updateMessageInCache(queryClient: QueryClient, message: Message): void {
  queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    ["messages", message.conversationId],
    (old) => old ? {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        messages: page.messages.map((m) => m.id === message.id ? mergeMessage(m, message) : m),
      })),
    } : old,
  );
}

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Helpers for writing messages INTO the React Query cache.
// The socket hook uses these instead of duplicating cache-update logic.
//
// OWNERSHIP RULE 2: The socket NEVER holds messages in a separate list.
// It writes directly into the React Query cache and returns.
//
// ─────────────────────────────────────────────────────────────────────────────

// ── appendMessageToCache ─────────────────────────────────────────────────────
// Inserts one message at the start of the first page (which holds the newest
// messages) for its conversation.
// If the message ID already exists anywhere in the cache, it is skipped.
// This is RULE 4: de-duplicate by ID at every write.
export function appendMessageToCache(
  queryClient: QueryClient,
  message: Message
): void {
  const key = ["messages", message.conversationId];

  queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    key,
    (old) => {
      if (!old) return old;

      // ── De-duplication check (RULE 4 — THE critical rule) ─────────────────
      const alreadyExists = old.pages.some((page) =>
        page.messages.some((m) => m.id === message.id)
      );
      if (alreadyExists) return old; // skip — we already have this message

      // ── Append to the first page (which holds the newest messages) ─────────
      const updatedFirstPage: MessagesPage = {
        ...old.pages[0],
        messages: [message, ...old.pages[0].messages],
      };

      return {
        ...old,
        pages: [updatedFirstPage, ...old.pages.slice(1)],
      };
    }
  );
}

// ── replaceOrAppendMessageInCache ─────────────────────────────────────────────
// Used when the server confirms a message we optimistically added as PENDING.
// If the message is found → replaces it IN PLACE (same position, no jump).
// If the message is NOT found → appends it as a new message.
// Returns true if a replacement happened, false if it was a new append.
export function replaceOrAppendMessageInCache(
  queryClient: QueryClient,
  message: Message
): boolean {
  const key = ["messages", message.conversationId];
  let found = false;

  queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    key,
    (old) => {
      if (!old) return old;
      let didReplace = false;
      const newPages = old.pages.map((page) => ({
        ...page,
        messages: page.messages.map((m) => {
          if (m.id === message.id) {
            didReplace = true;
            return mergeMessage(m, message);
          }
          return m;
        }),
      }));
      found = didReplace;
      return { ...old, pages: newPages };
    }
  );

  if (!found) {
    appendMessageToCache(queryClient, message);
  }
  return found;
}

// ── updateMessageStatusInCache ───────────────────────────────────────────────
// Finds a message by ID and updates its status.
// RULE: status never goes backwards. SENT < DELIVERED < READ.
// If the incoming status is lower than what we have, we ignore the update.
export function updateMessageStatusInCache(
  queryClient: QueryClient,
  conversationId: string,
  messageId: string,
  newStatus: Message["status"]
): void {
  const key = ["messages", conversationId];

  queryClient.setQueryData<{ pages: MessagesPage[]; pageParams: unknown[] }>(
    key,
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          messages: page.messages.map((m) => {
            if (m.id !== messageId) return m;
            const currentRank = STATUS_RANK[m.status] ?? 0;
            const newRank     = STATUS_RANK[newStatus] ?? 0;
            if (newRank <= currentRank) return m; // never downgrade
            return { ...m, status: newStatus };
          }),
        })),
      };
    }
  );
}
