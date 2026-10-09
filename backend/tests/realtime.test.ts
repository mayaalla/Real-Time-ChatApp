import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { Server, Socket } from "socket.io";

const mocks = vi.hoisted(() => ({
  isParticipant: vi.fn(),
  rateLimit: vi.fn(),
  modifyMessage: vi.fn(),
  deleteMessage: vi.fn(),
  prisma: {
    message: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() },
    receipt: { createMany: vi.fn() },
    $transaction: vi.fn(),
  },
  redis: { set: vi.fn(), del: vi.fn(), keys: vi.fn() },
}));
vi.mock("../src/db/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../src/modules/messages/messages.service.js", () => ({
  modifyMessage: mocks.modifyMessage, deleteMessage: mocks.deleteMessage,
}));
vi.mock("../src/modules/conversations/conversations.service.js", () => ({ isParticipant: mocks.isParticipant }));
vi.mock("../src/utils/socketRateLimiter.js", () => ({
  checkSocketRateLimit: mocks.rateLimit, MSG_LIMIT: 30, MSG_WINDOW_S: 60, NOISE_LIMIT: 60, NOISE_WINDOW_S: 60,
}));
vi.mock("../src/redis/client.js", () => ({ redisClient: mocks.redis }));

import { registerReceiptHandlers } from "../src/realtime/handlers/receipts.js";
import { registerMessageHandlers } from "../src/realtime/handlers/message.js";
import { registerTypingHandlers } from "../src/realtime/handlers/typing.js";

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = "aaaaaaaa-bbbb-4000-8000-000000000001";
const OTHER_CONVERSATION = "aaaaaaaa-bbbb-4000-8000-000000000002";

function setup(userId = BOB) {
  const handlers = new Map<string, (payload: unknown) => void>();
  const emit = vi.fn();
  const broadcast = { emit };
  const io = { to: vi.fn(() => broadcast) };
  const socket = {
    id: "test-socket", data: { userId, username: userId === BOB ? "bob" : "alice" },
    on: vi.fn((event: string, handler: (payload: unknown) => void) => handlers.set(event, handler)),
    emit: vi.fn(), join: vi.fn().mockResolvedValue(undefined), leave: vi.fn().mockResolvedValue(undefined),
  };
  return { io, socket, handlers, emit, server: io as unknown as Server, client: socket as unknown as Socket };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isParticipant.mockResolvedValue(true);
  mocks.rateLimit.mockResolvedValue({ allowed: true });
  mocks.prisma.message.findFirst.mockResolvedValue({ createdAt: new Date("2026-10-09T10:00:00Z") });
  mocks.prisma.message.findUnique.mockResolvedValue({ senderId: ALICE, conversationId: CONVERSATION });
  mocks.prisma.message.updateMany.mockResolvedValue({ count: 1 });
  mocks.prisma.message.count.mockResolvedValue(0);
  mocks.prisma.receipt.createMany.mockResolvedValue({ count: 2 });
  mocks.prisma.$transaction.mockImplementation((queries: Promise<unknown>[]) => Promise.all(queries));
  mocks.redis.keys.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("conversation rooms", () => {
  it("joins an authorized user with the guard arguments in the correct order", async () => {
    const s = setup();
    registerMessageHandlers(s.server, s.client);
    s.handlers.get("conversation:join")!({ conversationId: CONVERSATION });
    await vi.waitFor(() => expect(s.socket.emit).toHaveBeenCalledWith("conversation:joined", { conversationId: CONVERSATION }));
    expect(mocks.isParticipant).toHaveBeenCalledWith(BOB, CONVERSATION);
    expect(s.socket.join).toHaveBeenCalledWith(CONVERSATION);
  });
  it("does not join a non-member", async () => {
    mocks.isParticipant.mockResolvedValue(false);
    const s = setup();
    registerMessageHandlers(s.server, s.client);
    s.handlers.get("conversation:join")!({ conversationId: CONVERSATION });
    await vi.waitFor(() => expect(s.socket.emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: "NOT_PARTICIPANT" })));
    expect(s.socket.join).not.toHaveBeenCalled();
  });
});

describe("delivery receipts", () => {
  it("delivers without creating a read receipt or downgrading READ", async () => {
    const s = setup();
    registerReceiptHandlers(s.server, s.client);
    s.handlers.get("message:delivered")!({ messageId: "dm-msg-001" });
    await vi.waitFor(() => expect(s.emit).toHaveBeenCalledWith("message:status", {
      messageId: "dm-msg-001", conversationId: CONVERSATION, userId: BOB, status: "DELIVERED",
    }));
    expect(mocks.prisma.message.updateMany).toHaveBeenCalledWith({ where: { id: "dm-msg-001", status: "SENT" }, data: { status: "DELIVERED" } });
    expect(mocks.prisma.receipt.createMany).not.toHaveBeenCalled();
  });
  it("ignores a late delivery confirmation after a read", async () => {
    mocks.prisma.message.updateMany.mockResolvedValue({ count: 0 });
    const s = setup();
    registerReceiptHandlers(s.server, s.client);
    s.handlers.get("message:delivered")!({ messageId: "dm-msg-001" });
    await vi.waitFor(() => expect(mocks.prisma.message.updateMany).toHaveBeenCalled());
    expect(s.emit).not.toHaveBeenCalled();
  });
  it("does not let senders confirm their own delivery", async () => {
    const s = setup(ALICE);
    registerReceiptHandlers(s.server, s.client);
    s.handlers.get("message:delivered")!({ messageId: "dm-msg-001" });
    await vi.waitFor(() => expect(mocks.prisma.message.findUnique).toHaveBeenCalled());
    expect(mocks.prisma.message.updateMany).not.toHaveBeenCalled();
  });
});

describe("read receipts", () => {
  it.each([[ALICE, BOB], [BOB, ALICE]])("updates every message when %s reads %s's messages", async (reader, sender) => {
    const s = setup(reader);
    mocks.prisma.message.findMany.mockResolvedValue([{ id: "dm-msg-001", senderId: sender }, { id: "dm-msg-002", senderId: sender }]);
    registerReceiptHandlers(s.server, s.client);
    s.handlers.get("message:read")!({ conversationId: CONVERSATION, lastReadMessageId: "dm-msg-002" });
    await vi.waitFor(() => expect(s.socket.emit).toHaveBeenCalledWith("message:read_ack", { conversationId: CONVERSATION, lastReadMessageId: "dm-msg-002" }));
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    for (const id of ["dm-msg-001", "dm-msg-002"]) {
      expect(s.emit).toHaveBeenCalledWith("message:status", { messageId: id, conversationId: CONVERSATION, userId: reader, status: "READ" });
    }
    expect(s.io.to).toHaveBeenCalledWith([CONVERSATION, `user:${sender}`]);
    expect(mocks.prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ senderId: { not: reader }, OR: [{ receipt: { none: { userId: reader } } }, { status: { not: "READ" } }] }),
    }));
    expect(mocks.prisma.receipt.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.message.updateMany).toHaveBeenCalledTimes(1);
  });
  it("acknowledges an already-read frontier and synchronizes unread count without writes", async () => {
    mocks.prisma.message.findMany.mockResolvedValue([]);
    const s = setup();
    registerReceiptHandlers(s.server, s.client);
    s.handlers.get("message:read")!({ conversationId: CONVERSATION, lastReadMessageId: "dm-msg-002" });
    await vi.waitFor(() => expect(s.socket.emit).toHaveBeenCalledWith("message:read_ack", expect.anything()));
    expect(s.emit).toHaveBeenCalledWith("conversation:unread_count", { conversationId: CONVERSATION, unreadCount: 0 });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects a message frontier from another conversation", async () => {
    mocks.prisma.message.findFirst.mockResolvedValue(null);
    const s = setup();
    registerReceiptHandlers(s.server, s.client);
    s.handlers.get("message:read")!({ conversationId: OTHER_CONVERSATION, lastReadMessageId: "dm-msg-002" });
    await vi.waitFor(() => expect(s.socket.emit).toHaveBeenCalledWith("error", expect.objectContaining({ code: "NOT_FOUND" })));
    expect(mocks.prisma.message.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "dm-msg-002", conversationId: OTHER_CONVERSATION } }));
    expect(mocks.prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe("typing", () => {
  it("refreshes the marker and broadcasts an empty list after expiry", async () => {
    vi.useFakeTimers();
    const s = setup();
    mocks.redis.keys.mockResolvedValueOnce([`typing:${CONVERSATION}:${BOB}`]).mockResolvedValue([]);
    registerTypingHandlers(s.server, s.client);
    s.handlers.get("typing:start")!({ conversationId: CONVERSATION });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.emit).toHaveBeenCalledWith("typing:update", { conversationId: CONVERSATION, typerIds: [BOB] });
    await vi.advanceTimersByTimeAsync(4000);
    s.handlers.get("typing:start")!({ conversationId: CONVERSATION });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.redis.set).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6000);
    expect(s.emit).toHaveBeenLastCalledWith("typing:update", { conversationId: CONVERSATION, typerIds: [] });
    expect(mocks.redis.keys).toHaveBeenCalledTimes(3);
  });
  it("rejects a non-member's typing stop", async () => {
    mocks.isParticipant.mockResolvedValue(false);
    const s = setup();
    registerTypingHandlers(s.server, s.client);
    s.handlers.get("typing:stop")!({ conversationId: CONVERSATION });
    await vi.waitFor(() => expect(mocks.isParticipant).toHaveBeenCalled());
    expect(mocks.redis.del).not.toHaveBeenCalled();
    expect(s.emit).not.toHaveBeenCalled();
  });
});
