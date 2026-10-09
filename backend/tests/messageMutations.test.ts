import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";

const mocks = vi.hoisted(() => ({
  isParticipant: vi.fn(),
  prisma: {
    message: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    participant: { findMany: vi.fn() },
  },
}));
vi.mock("../src/db/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../src/modules/conversations/conversations.service.js", () => ({ isParticipant: mocks.isParticipant }));
vi.mock("../src/modules/uploads/uploads.service.js", () => ({ signUploadService: vi.fn() }));

import { deleteMessage, modifyMessage } from "../src/modules/messages/messages.service.js";
import { broadcastMessageChange } from "../src/realtime/messageUpdates.js";

const original = {
  id: "dm-msg-001", senderId: "alice", conversationId: "conversation",
  textBody: "Original", attachmentAddress: ["https://example.com/image.png"], status: "READ" as const,
  createdAt: new Date("2026-10-09T10:00:00Z"), editedAt: null, deletedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isParticipant.mockResolvedValue(true);
  mocks.prisma.message.findFirst.mockResolvedValue(original);
  mocks.prisma.message.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.message.findUniqueOrThrow.mockResolvedValue({ ...original, textBody: "Updated", editedAt: new Date() });
});

describe("message mutations", () => {
  it("rejects changes to another user's messages without writing", async () => {
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    await expect(modifyMessage(original.id, "bob", "Updated")).rejects.toThrow("your own messages");
    await expect(deleteMessage(original.id, "bob")).rejects.toThrow("your own messages");
    expect(mocks.prisma.message.findFirst).toHaveBeenCalledWith({ where: { id: original.id, senderId: "bob" } });
    expect(mocks.prisma.message.update).not.toHaveBeenCalled();
    expect(mocks.prisma.message.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a former participant even when they own the message", async () => {
    mocks.isParticipant.mockResolvedValue(false);
    await expect(deleteMessage(original.id, "alice")).rejects.toThrow("conversations you belong to");
    expect(mocks.isParticipant).toHaveBeenCalledWith("alice", original.conversationId);
    expect(mocks.prisma.message.update).not.toHaveBeenCalled();
  });
  it("saves trimmed text and editedAt while retaining attachments and read status", async () => {
    const updated = await modifyMessage(original.id, "alice", "  Updated  ");
    expect(updated.textBody).toBe("Updated");
    expect(updated.attachmentAddress).toEqual(original.attachmentAddress);
    expect(updated.status).toBe("READ");
    expect(mocks.prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: original.id, senderId: "alice", deletedAt: null },
      data: { textBody: "Updated", editedAt: expect.any(Date) },
    });
  });
  it("rejects empty and oversized edits", async () => {
    await expect(modifyMessage(original.id, "alice", "   ")).rejects.toThrow();
    await expect(modifyMessage(original.id, "alice", "x".repeat(2001))).rejects.toThrow();
    expect(mocks.prisma.message.updateMany).not.toHaveBeenCalled();
  });
  it("rejects edits to deleted and attachment-only messages", async () => {
    mocks.prisma.message.findFirst.mockResolvedValue({ ...original, deletedAt: new Date() });
    await expect(modifyMessage(original.id, "alice", "Updated")).rejects.toThrow("cannot be edited");
    mocks.prisma.message.findFirst.mockResolvedValue({ ...original, textBody: null });
    await expect(modifyMessage(original.id, "alice", "Updated")).rejects.toThrow("cannot be edited");
    expect(mocks.prisma.message.updateMany).not.toHaveBeenCalled();
  });
  it("does not edit a message deleted concurrently", async () => {
    mocks.prisma.message.updateMany.mockResolvedValue({ count: 0 });
    await expect(modifyMessage(original.id, "alice", "Updated")).rejects.toThrow("already been deleted");
    expect(mocks.prisma.message.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it("soft-deletes and keeps an existing deletion timestamp on retry", async () => {
    const deleted = { ...original, deletedAt: new Date() };
    mocks.prisma.message.update.mockResolvedValue(deleted);
    expect(await deleteMessage(original.id, "alice")).toEqual(deleted);
    expect(mocks.prisma.message.update).toHaveBeenCalledWith({
      where: { id: original.id, senderId: "alice" }, data: { deletedAt: expect.any(Date) },
    });
    mocks.prisma.message.findFirst.mockResolvedValue(deleted);
    expect(await deleteMessage(original.id, "alice")).toEqual(deleted);
    expect(mocks.prisma.message.update).toHaveBeenCalledTimes(1);
  });
  it("broadcasts deletions to participant rooms without exposing deleted content", async () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    mocks.prisma.participant.findMany.mockResolvedValue([{ userId: "alice" }, { userId: "bob" }]);
    const deletedAt = new Date("2026-10-09T11:00:00Z");
    await broadcastMessageChange({ to } as unknown as Server, { ...original, deletedAt });
    expect(to).toHaveBeenCalledWith([original.conversationId, "user:alice", "user:bob"]);
    expect(emit).toHaveBeenCalledWith("message:deleted", { message: {
      id: original.id, conversationId: original.conversationId, senderId: original.senderId,
      textBody: null, attachments: [], status: "READ", createdAt: original.createdAt.toISOString(),
      editedAt: null, deletedAt: deletedAt.toISOString(),
    } });
  });
});
