import { describe, expect, it } from "vitest";
import { normaliseConversation } from "../../frontend/src/api/conversations.api";

const alice = { id: "alice-user", username: "alice", avatarAddress: null, lastSeen: null };
const bob = { id: "bob-user", username: "bob", avatarAddress: null, lastSeen: "2026-10-09T10:00:00Z" };
const raw = {
  id: "conversation", isGroup: false, displayName: "bob", displayPicture: null,
  lastMessage: null, unreadCount: 0,
  participants: [{ id: "alice-membership", user: alice }, { id: "bob-membership", user: bob }],
};

describe("conversation participant identity", () => {
  it.each([[alice, bob], [bob, alice]])("matches presence by user ID for $username", (viewer, other) => {
    const conversation = normaliseConversation(raw);
    const partner = conversation.participants.find((p) => p.id !== viewer.id)!;
    const presence = new Map([[other.id, { online: true }]]);
    expect(partner.id).toBe(other.id);
    expect(partner.username).toBe(other.username);
    expect(presence.get(partner.id)?.online).toBe(true);
    expect(partner.lastSeen).toBe(other.lastSeen);
    expect(raw.participants[0].id).toBe("alice-membership");
  });
});
