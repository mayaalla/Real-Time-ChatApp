import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { ClientEvents, ServerEvents, type MessageReadPayload } from "../events.js";
import { isParticipant } from "../../modules/conversations/conversations.service.js";
import { prisma } from "../../db/prisma.js";
import { safeHandler, emitError } from "./utils.js";

export function registerReceiptHandlers(io: Server, socket: Socket): void {
  socket.on(
    "message:delivered",
    safeHandler<{ messageId: string }>(socket, async (payload) => {
      // Older seeded messages use IDs such as "dm-msg-001"; Message.id is a String.
      const parsed = z.object({ messageId: z.string().min(1).max(128) }).safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", "messageId must be a non-empty message ID");
        return;
      }

      const { messageId } = parsed.data;
      const userId: string = socket.data.userId;
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { senderId: true, conversationId: true },
      });
      if (!message || message.senderId === userId) return;
      if (!(await isParticipant(userId, message.conversationId))) return;

      // Receipt rows represent reads only. Delivery must not clear unread counts
      // or prevent a later read. The conditional write also avoids READ -> DELIVERED races.
      const { count } = await prisma.message.updateMany({
        where: { id: messageId, status: "SENT" },
        data: { status: "DELIVERED" },
      });
      if (count === 0) return;

      io.to(`user:${message.senderId}`).emit(ServerEvents.MESSAGE_STATUS, {
        messageId,
        conversationId: message.conversationId,
        status: "DELIVERED",
        userId,
      });
    }),
  );

  socket.on(
    ClientEvents.MESSAGE_READ,
    safeHandler<MessageReadPayload>(socket, async (payload) => {
      const parsed = z.object({
        conversationId: z.string().uuid(),
        lastReadMessageId: z.string().min(1).max(128),
      }).safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid payload");
        return;
      }

      const { conversationId, lastReadMessageId } = parsed.data;
      const userId: string = socket.data.userId;
      if (!(await isParticipant(userId, conversationId))) {
        emitError(socket, "NOT_MEMBER", "You are not a participant in this conversation");
        return;
      }

      // A message from another conversation must never be used as a read frontier.
      const lastReadMessage = await prisma.message.findFirst({
        where: { id: lastReadMessageId, conversationId },
        select: { createdAt: true },
      });
      if (!lastReadMessage) {
        emitError(socket, "NOT_FOUND", "Message not found in this conversation");
        return;
      }

      const unreadMessages = await prisma.message.findMany({
        where: {
          conversationId,
          createdAt: { lte: lastReadMessage.createdAt },
          senderId: { not: userId },
          // The status branch repairs receipts wrongly created by the old delivery handler.
          OR: [{ receipt: { none: { userId } } }, { status: { not: "READ" } }],
        },
        select: { id: true, senderId: true },
      });

      if (unreadMessages.length > 0) {
        // Keep receipt creation and status updates atomic, with bulk writes only.
        await prisma.$transaction([
          prisma.receipt.createMany({
            data: unreadMessages.map((m) => ({ messageId: m.id, userId })),
            skipDuplicates: true,
          }),
          prisma.message.updateMany({
            where: { id: { in: unreadMessages.map((m) => m.id) }, status: { not: "READ" } },
            data: { status: "READ" },
          }),
        ]);

        for (const message of unreadMessages) {
          // Socket.IO unions these rooms, so a sender in both receives one event.
          io.to([conversationId, `user:${message.senderId}`]).emit(ServerEvents.MESSAGE_STATUS, {
            messageId: message.id,
            conversationId,
            status: "READ",
            userId,
          });
        }
      }

      const unreadCount = await prisma.message.count({
        where: {
          conversationId,
          senderId: { not: userId },
          receipt: { none: { userId } },
        },
      });
      io.to(`user:${userId}`).emit("conversation:unread_count", { conversationId, unreadCount });
      // Acknowledge even a repeated frontier so the client can stop retrying it.
      socket.emit("message:read_ack", { conversationId, lastReadMessageId });
    }),
  );
}
