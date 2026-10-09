import type { Server } from "socket.io";
import type { Message } from "../generated/prisma/client.js";
import { prisma } from "../db/prisma.js";
import { ServerEvents } from "./events.js";

export async function broadcastMessageChange(io: Server, message: Message): Promise<void> {
  const participants = await prisma.participant.findMany({
    where: { conversationId: message.conversationId },
    select: { userId: true },
  });
  const rooms = [message.conversationId, ...participants.map((p) => `user:${p.userId}`)];
  io.to(rooms).emit(message.deletedAt ? ServerEvents.MESSAGE_DELETED : ServerEvents.MESSAGE_EDITED, {
    message: {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      textBody: message.deletedAt ? null : message.textBody,
      attachments: message.deletedAt ? [] : message.attachmentAddress,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      deletedAt: message.deletedAt?.toISOString() ?? null,
    },
  });
}
