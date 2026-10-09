import { describe, expect, it } from "vitest";
import { QueryClient } from "../../frontend/node_modules/@tanstack/react-query";
import { mergeMessage, replaceOrAppendMessageInCache, updateMessageStatusInCache } from "../../frontend/src/utils/messageCache";
import type { Message, MessagesPage } from "../../frontend/src/api/messages.api";

const message: Message = {
  id: "message-1", conversationId: "conversation-1", senderId: "alice", textBody: "hello",
  attachments: [], status: "PENDING", createdAt: "2026-10-09T10:00:00Z", editedAt: null, deletedAt: null,
};
function cache() {
  const client = new QueryClient();
  client.setQueryData(["messages", message.conversationId], {
    pages: [{ messages: [message], nextCursor: null, hasMore: false }], pageParams: [null],
  });
  const messages = () => client.getQueryData<{ pages: MessagesPage[] }>(["messages", message.conversationId])!.pages.flatMap((p) => p.messages);
  return { client, messages };
}

describe("message status cache", () => {
  it("replaces optimistic messages, upgrades ticks, and ignores late SENT/DELIVERED events", () => {
    const c = cache();
    replaceOrAppendMessageInCache(c.client, { ...message, status: "SENT" });
    updateMessageStatusInCache(c.client, message.conversationId, message.id, "READ");
    updateMessageStatusInCache(c.client, message.conversationId, message.id, "DELIVERED");
    replaceOrAppendMessageInCache(c.client, { ...message, status: "SENT" });
    expect(c.messages()).toHaveLength(1);
    expect(c.messages()[0]!.status).toBe("READ");
  });
  it("updates already-loaded history and isolates the conversation", () => {
    const c = cache();
    updateMessageStatusInCache(c.client, "conversation-2", message.id, "READ");
    expect(c.messages()[0]!.status).toBe("PENDING");
    updateMessageStatusInCache(c.client, message.conversationId, message.id, "READ");
    expect(c.messages()[0]!.status).toBe("READ");
  });
  it("retains live READ ticks when merging stale REST history", () => {
    expect(mergeMessage({ ...message, status: "READ" }, { ...message, status: "SENT" }).status).toBe("READ");
  });
});

describe("message mutation cache", () => {
  it("preserves a newer edit when a stale message arrives", () => {
    const latest = { ...message, status: "READ" as const, textBody: "edited", editedAt: "2026-10-09T11:00:00Z" };
    expect(mergeMessage(latest, { ...message, status: "SENT" }).textBody).toBe("edited");
    expect(mergeMessage(latest, message).editedAt).toBe(latest.editedAt);
  });
  it("cannot resurrect deleted text or attachments with a late edit", () => {
    const deleted = { ...message, deletedAt: "2026-10-09T11:00:00Z" };
    const merged = mergeMessage(deleted, { ...message, textBody: "late edit", attachments: ["photo.png"], editedAt: "2026-10-09T11:01:00Z" });
    expect(merged.deletedAt).toBe(deleted.deletedAt);
    expect(merged.textBody).toBeNull();
    expect(merged.attachments).toEqual([]);
  });
});
