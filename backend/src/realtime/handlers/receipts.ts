import type { Server, Socket } from "socket.io";
import { z } from "zod";

import {
  ClientEvents,
  ServerEvents,
  type MessageReadPayload,
} from "../events.js";

import { isParticipant } from "../../modules/conversations/conversations.service.js";
import { prisma } from "../../db/prisma.js";
import { safeHandler, emitError } from "./utils.js";

export function registerReceiptHandlers(io: Server, socket: Socket): void { 


 socket.on("message:delivered",
  safeHandler<{messageId:string}>(socket, async(playload) =>{
          // Step 1: Validate
          const parsed = z.object({ messageId: z.string().uuid() }).safeParse(payload);
          if (!parsed.success) {
            emitError(socket, "VALIDATION_ERROR", "messageId must be a valid UUID");
            return;
          }
    
          const { messageId } = parsed.data;
          const userId: string = socket.data.userId;

          // find the message in the db
          const message = await prisma.message.findUnique({
            where: { id: messageId },
          });
    
          if (!message) {
            // Message not found — probably already deleted. Silently ignore.
            return;
          }
          //check mmmbr ships
          const member = await isParticipant(userId, message.conversationId);
          if (!member) return;   // silently ignore — not an error worth surfacing
    
          if (message.status === "SENT") {
            await prisma.message.update({
              where: { id: messageId },
              data:  { status: "DELIVERED" },
            });
          }

                // Step 5: Create a receipt row for this user.
      // skipDuplicates = true means if this user already confirmed delivery,
      // do nothing. No error, no duplicate row.
      await prisma.receipt.upsert({
        where:  { messageId_userId: { messageId, userId } },
        update: {},               // already exists → do nothing
        create: { messageId, userId },
      });
          // Step 6: Notify the SENDER that delivery happened.
      // We look up which socket(s) belong to the sender via their user room.
      // "message:status" tells the sender: "your message now shows two ticks"
      io.to(`user:${message.senderId}`).emit(ServerEvents.MESSAGE_STATUS, {
        messageId,
        status: "DELIVERED",
        userId,   // which user triggered this status change
      });


    
  })

  




 )

 socket.on(
  ClientEvents.MESSAGE_READ,
  safeHandler<MessageReadPayload>(socket, async (payload) => {

    // Step 1: Validate
    const parsed = z
      .object({
        conversationId:    z.string().uuid(),
        lastReadMessageId: z.string().uuid(),
      })
      .safeParse(payload);

    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid payload");
      return;
    }

    const { conversationId, lastReadMessageId } = parsed.data;
    const userId: string = socket.data.userId;

    // Step 2: Check membership
    const member = await isParticipant(userId, conversationId);
    if (!member) {
      emitError(socket, "NOT_MEMBER", "You are not a participant in this conversation");
      return;
    }

    // Step 3: Find the createdAt of the lastReadMessageId.
    // We need this timestamp so we can find ALL messages up to this point.
    const lastReadMessage = await prisma.message.findUnique({
      where:  { id: lastReadMessageId },
      select: { createdAt: true },
    });

    if (!lastReadMessage) {
      emitError(socket, "NOT_FOUND", "Message not found");
      return;
    }

    // Step 4: Get all message IDs in this conversation up to lastReadMessageId
    // that do NOT already have a receipt from this user.
    // We do this in ONE query — no loop.
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId,
        createdAt: { lte: lastReadMessage.createdAt },   // up to and including
        receipt:   { none: { userId } },                  // no receipt from me yet
        senderId:  { not: userId },                       // don't mark your own messages
      },
      select: { id: true, senderId: true },
    });

    if (unreadMessages.length === 0) {
      // Nothing to mark as read — already done. That's fine.
      return;
    }

    // Step 5: Create receipt rows for all those messages in ONE bulk operation.
    // skipDuplicates = true means if a receipt already exists, skip it.
    // No error, no crash.
    await prisma.receipt.createMany({
      data:          unreadMessages.map((m) => ({ messageId: m.id, userId })),
      skipDuplicates: true,
    });

    // Step 6: Update message statuses to READ in ONE operation.
    // We update all those messages at once instead of one by one.
    const messageIds = unreadMessages.map((m) => m.id);
    await prisma.message.updateMany({
      where: { id: { in: messageIds } },
      data:  { status: "READ" },
    });

    // Step 7: Emit message:status to the conversation room.
    // Everyone in the room (including the senders) will see their ticks
    // turn blue.
    // We send one event per message so the frontend can update each bubble.
    for (const m of unreadMessages) {
      io.to(conversationId).emit(ServerEvents.MESSAGE_STATUS, {
        messageId: m.id,
        status:    "READ",
        userId,
      });
    }

    // Also notify senders via their personal user rooms in case they are
    // NOT currently in this conversation room.
    const uniqueSenderIds = [...new Set(unreadMessages.map((m) => m.senderId))];
    for (const senderId of uniqueSenderIds) {
      io.to(`user:${senderId}`).emit(ServerEvents.MESSAGE_STATUS, {
        // We send the lastReadMessageId as representative —
        // the frontend can use this to update all messages up to here.
        messageId: lastReadMessageId,
        status:    "READ",
        userId,
      });
    }

    console.log(
      `${socket.data.username} marked ${unreadMessages.length} messages as read in ${conversationId}`,
    );
  }),
);

}