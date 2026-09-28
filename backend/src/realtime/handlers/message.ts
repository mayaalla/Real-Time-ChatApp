import type { Server, Socket } from "socket.io";
import {
  ClientEvents,
  ServerEvents,
  type ConversationJoinPayload,
  type ConversationLeavePayload,
  type MessageSendPayload,
} from "../events.js";
// Part 13 will fill this in
import { isParticipant } from "../../modules/conversations/conversations.service.js";
import { prisma } from "../../db/prisma.js";
import { safeHandler, emitError } from "./utils.js";
import { z } from "zod";

// the user join a room of convo only if they open a chat, if they open other chat they leave the previous one
// the nutiifcation for other chats will come only from thier personal room 


export function registerMessageHandlers(io: Server, socket: Socket): void {

  // join convo
  // check the memeber chip then put the socket in the room

  socket.on(ClientEvents.CONVERSATION_JOIN,
    safeHandler(socket, async (payload: ConversationJoinPayload) => {
    
    const parsed = z.object({ conversationId: z.string().uuid() }).safeParse(payload);
    if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", "conversationId must be a valid UUID");
        return;
    }

    const { conversationId } = parsed.data;

    // get the userid from the socket.data

    const userId : string = socket.data.userId;

    // check if the user is a member of the conversation
    const isMember = await isParticipant(conversationId, userId);
    if (!isMember) {
      emitError(socket, "NOT_PARTICIPANT", "You are not a member of this conversation");
      return;
    }
    // join the room
    await socket.join(conversationId);
    console.log(`${socket.data.username} joined conversation room ${conversationId}`);

    // tell the client it worked
    socket.emit("conversation:joined", { conversationId });
    }
  ));

  socket.on(ClientEvents.CONVERSATION_LEAVE
    ,  safeHandler<ConversationLeavePayload>(socket, async (payload) => {

      const parsed = z.object({ conversationId: z.string().uuid() }).safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", "conversationId must be a valid UUID");
        return;
      }
      const { conversationId } = parsed.data;

      await socket.leave(conversationId);

      console.log(`${socket.data.username} left conversation room ${conversationId}`);
    }
  ));

}


// conversation:leave
