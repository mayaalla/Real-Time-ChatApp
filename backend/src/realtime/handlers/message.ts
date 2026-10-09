import type { Server, Socket } from "socket.io";
import {
  ClientEvents,
  ServerEvents,
  type ConversationJoinPayload,
  type ConversationLeavePayload,
  type MessageSendPayload,
  type MessageEditPayload,
  type MessageDeletePayload,
} from "../events.js";
// Part 13 will fill this in
import { isParticipant } from "../../modules/conversations/conversations.service.js";
import { prisma } from "../../db/prisma.js";
import { safeHandler, emitError } from "./utils.js";
import { z } from "zod";
import { deleteMessage, modifyMessage } from "../../modules/messages/messages.service.js";
import { EditMessageBodySchema, MessageParamsSchema } from "../../modules/messages/messages.schemas.js";
import { broadcastMessageChange } from "../messageUpdates.js";

import { checkSocketRateLimit, MSG_LIMIT, MSG_WINDOW_S, NOISE_LIMIT, NOISE_WINDOW_S} from "../../utils/socketRateLimiter.js";

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
     // Rate-limit join requests (a script could rapidly join and leave rooms).
     const rateResult = await checkSocketRateLimit(socket.data.userId, NOISE_LIMIT, NOISE_WINDOW_S);
     if (!rateResult.allowed) {
       emitError(socket, "TOO_MANY_REQUESTS", "Too many join requests. Slow down.");
       return;
     }


    const userId : string = socket.data.userId;

    // check if the user is a member of the conversation
    const isMember = await isParticipant(userId, conversationId);
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

  // message:send
  socket.on(
    ClientEvents.MESSAGE_SEND,
    safeHandler<MessageSendPayload>(socket, async (payload) => {

      // ── Step 1: Validate the payload with Zod ──────────────────────────────
      // Same rules as the REST endpoint:
      //   - id must be a valid UUID (client-generated)
      //   - conversationId must be a valid UUID
      //   - at least one of textBody or attachments must be present
      const MessageSendSchema = z
        .object({
          id:             z.string().uuid("id must be a valid UUID"),
          conversationId: z.string().uuid("conversationId must be a valid UUID"),
          textBody: z.string().trim().min(1).max(2000, "Message cannot exceed 2000 characters").optional(),
          attachments:    z.array(z.string().min(1)).optional(),
        })
        .refine(
          (d) => d.textBody !== undefined || (d.attachments?.length ?? 0) > 0,
          { message: "Message must have textBody, attachments, or both" },
        );

      const parsed = MessageSendSchema.safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid payload");
        return;
      }

      const { id, conversationId, textBody, attachments } = parsed.data;

            // ── Step 2: Rate limit check ─────────────────────────────────────────────
      // Import at the top of the file: import { checkSocketRateLimit, MSG_LIMIT, MSG_WINDOW_S } from "../../utils/socketRateLimiter.js";

      const userId: string = socket.data.userId;
      const rateResult = await checkSocketRateLimit(userId, MSG_LIMIT, MSG_WINDOW_S);
      if (!rateResult.allowed) {
        emitError(
          socket,
          "TOO_MANY_REQUESTS",
          `Slow down. You can send ${MSG_LIMIT} messages per ${MSG_WINDOW_S} seconds. ` +
          `Try again in ${rateResult.retryAfter} second(s).`,
        );
        return;
      }

      // ── Step 2: Get the sender's userId from socket.data ───────────────────
      // NEVER use userId from the payload. The client could lie.
      const senderId: string = socket.data.userId;

      // ── Step 3: Check membership ───────────────────────────────────────────
      const member = await isParticipant(senderId, conversationId);
      if (!member) {
        emitError(socket, "NOT_MEMBER", "You are not a participant in this conversation");
        return;
      }

      // ── Step 4: Save (or find) the message in the database ─────────────────
      //
      // We use "upsert" — which means:
      //   IF a message with this id already exists → return it (do nothing)
      //   IF it does NOT exist → create it
      //
      // This is the magic that makes re-sends after a disconnect harmless.
      // The client always generates the UUID. If the same UUID arrives twice,
      // the second one is silently ignored and the first is returned.
      //
      // "attachmentAddress" in the database is a String[] (array of URLs).
      // We save whatever the client sent, or an empty array if nothing.
      const message = await prisma.message.upsert({
        where: { id },          // look for a row with this exact id
        include: {
          sender: { select: { id: true, username: true, avatarAddress: true, lastSeen: true } },
        },
        update: {},             // if it exists → do nothing, just return it
        create: {               // if it does NOT exist → create it
          id,
          senderId,
          conversationId,
          textBody:          textBody ?? null,
          attachmentAddress: attachments ?? [],
          status:            "SENT",
        },
      });

      // ── Step 5: Build the payload we will send back ────────────────────────
      // We convert Date objects to ISO strings so they travel safely over the wire.
      const messagePayload = {
        message: {
          id:             message.id,
          conversationId: message.conversationId,
          senderId:       message.senderId,
          sender: {
            ...message.sender,
            lastSeen: message.sender.lastSeen?.toISOString() ?? null,
          },
          textBody:       message.textBody,
          attachments:    message.attachmentAddress,   // the DB column name
          status:         message.status,
          createdAt:      message.createdAt.toISOString(),
          editedAt:       message.editedAt  ? message.editedAt.toISOString()  : null,
          deletedAt:      message.deletedAt ? message.deletedAt.toISOString() : null,
        },
      };

      // ── Step 6: Acknowledge back to the SENDER ─────────────────────────────
      // This is the "ack" — only the sender gets this reply.
      // It tells the client: "Your message was saved. Here it is with the
      // real server timestamp and status."
      socket.emit(ServerEvents.MESSAGE_NEW, messagePayload);

      // ── Step 7: Broadcast to EVERYONE ELSE in the conversation room ─────────
      // socket.to(room) = everyone in that room EXCEPT the sender's socket.
      // We already sent to the sender above, so this covers everyone else.
      socket.to(conversationId).emit(ServerEvents.MESSAGE_NEW, messagePayload);

      // ── Step 8: Notify users NOT currently in the room ─────────────────────
      // If a participant has this app open but is looking at a DIFFERENT chat,
      // they are NOT in the conversationId room.
      // We send to their personal "user:{userId}" room so their conversation
      // list and unread badge update in real time.
      //
      // Get all participant userIds for this conversation.
      const participants = await prisma.participant.findMany({
        where:  { conversationId },
        select: { userId: true },
      });

      for (const p of participants) {
        // Skip the sender — they already got the message above.
        if (p.userId === senderId) continue;
        // Send to the user's personal room. If they are in the conversation
        // room, they already got it from step 7 — the client must de-duplicate
        // by message id.
        io.to(`user:${p.userId}`).except(conversationId).emit(ServerEvents.MESSAGE_NEW, messagePayload);
      }

      console.log(`Message ${id} saved and broadcast to conversation ${conversationId}`);
    }),
  );

  socket.on(ClientEvents.MESSAGE_EDIT,
    safeHandler<MessageEditPayload>(socket, async (payload) => {
      const parsed = z.object({
        id: MessageParamsSchema.shape.messageId,
        textBody: EditMessageBodySchema.shape.textBody,
      }).safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid edit");
        return;
      }
      const message = await modifyMessage(parsed.data.id, socket.data.userId, parsed.data.textBody);
      await broadcastMessageChange(io, message);
    }),
  );

  socket.on(ClientEvents.MESSAGE_DELETE,
    safeHandler<MessageDeletePayload>(socket, async (payload) => {
      const parsed = z.object({ id: MessageParamsSchema.shape.messageId }).safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid message ID");
        return;
      }
      const message = await deleteMessage(parsed.data.id, socket.data.userId);
      await broadcastMessageChange(io, message);
    }),
  );


}


// NOTE — about "de-duplication by message id" (mentioned in Step 8 above):
//   A user who IS in the conversation room gets message:new TWICE:
//     Once from  socket.to(conversationId)   (Step 7)
//     Once from  io.to("user:{userId}")      (Step 8)
//   The frontend must check: "do I already have a message with this id?"
//   If yes → ignore the second one. This is easy to do in React Query / Zustand.
//   The backend keeps it simple by sending both; the frontend de-duplicates.
