import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { isParticipant } from "../../modules/conversations/conversations.service.js";
import { safeHandler, emitError } from "./utils.js";

// max of messages will be load if the connction gone and back
const  MAX_SYNC_MESSAGES = 200;

export function registerSyncHandlers(io: Server, socket: Socket): void {
  // client sends this on ever reconnect for the currently open conversation

  socket.on(
    "sync:since",
    safeHandler<{ conversationId: string; since: string }>(socket, async (payload) => {
      //1. validate data
      const parsed = z
      .object({
        conversationId: z.string().uuid(),
        since:          z.string().uuid(),
      })
      .safeParse(payload);

    if (!parsed.success) {
      emitError(socket, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid payload");
      return;
    }

    const {conversationId, since} = parsed.data
    const userId: string = socket.data.userId

    // check membership of the user in that convo
    const member = await isParticipant(userId, conversationId);
    if (!member) {
      emitError(socket, "NOT_MEMBER", "You are not a participant in this conversation");
      return;
    }

    // find the last message before the reconnection 
    const sinceMessage = await prisma.message.findUnique({
      where:  { id: since },
      select: { createdAt: true },
    });

    if (!sinceMessage) {
      // The "since" message doesn't exist — this conversation must be new to the client.
      // Tell the client to do a full reload via the REST endpoint.
      socket.emit("sync:reload", { conversationId });
      return;
    }

    // Step 4: Count how many messages are newer than "since".
    const missedCount = await prisma.message.count({
    where: {
      conversationId,
      createdAt: { gt: sinceMessage.createdAt },
          },
    });

    // if to many messages are missing tell the client to reload
    // if there is over 300 for exmpale over socket, it will be bad for memeory and ux  
    if (missedCount > MAX_SYNC_MESSAGES) {
      socket.emit("sync:reload", { conversationId });
      return;
    }
    
    // fetch the missed messages
    const missedMessages = await prisma.message.findMany({
      where: {
        conversationId,
        createdAt: { gt: sinceMessage.createdAt },
      },
      orderBy: { createdAt: "asc" },  // oldest first so the client can append in order
      include: {
        sender: {
          select: { id: true, username: true, avatarAddress: true },
        },
      },
    });

    // send the missed messages back to this socket only

    const messages = missedMessages.map((m)=>({
      id:             m.id,
      conversationId: m.conversationId,
      senderId:       m.senderId,
      sender:         m.sender,
      textBody:       m.textBody,
      attachments:    m.attachmentAddress,
      status:         m.status,
      createdAt:      m.createdAt.toISOString(),
      editedAt:       m.editedAt?.toISOString() ?? null,
      deletedAt:      m.deletedAt?.toISOString() ?? null,
    }))

    socket.emit("sync:messages", {
      conversationId, messages
    })

    if (messages.length > 0) {
      console.log(
        `[Sync] Sent ${messages.length} missed message(s) to ${socket.data.username} ` +
        `in conversation ${conversationId}`,
      );
    }



    })
  )
}