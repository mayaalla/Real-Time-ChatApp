
import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { redisClient } from "../../redis/client.js";
import { isParticipant } from "../../modules/conversations/conversations.service.js";
import { ClientEvents, ServerEvents } from "../events.js";
import { safeHandler, emitError } from "./utils.js";
import { checkSocketRateLimit, NOISE_LIMIT, NOISE_WINDOW_S } from "../../utils/socketRateLimiter.js";

// ─── KEY HELPERS ──────────────────────────────────────────────────────────────

const typingKey = (conversationId: string, userId: string) =>
  `typing:${conversationId}:${userId}`;

// Pattern used to scan all typing keys in a conversation.
// Redis "KEYS typing:{conversationId}:*" finds all typers in a conversation.
const typingPattern = (conversationId: string) => `typing:${conversationId}:*`;

// Seconds before a "typing" marker expires automatically.
// If the client stops sending typing:start, indicator disappears after this.
const TYPING_TTL_SECONDS = 5;


/**
 * Registers typing indicator socket handlers.
 * Call this once per new socket connection from realtime/index.ts.
 */
export function registerTypingHandlers(io: Server, socket: Socket): void {

  // ── typing:start ─────────────────────────────────────────────────────────────
  // Client sends this when the user starts typing (throttled — not every keystroke).
  // We write a 5-second Redis key. If the client keeps sending this event, the
  // TTL is refreshed each time and the indicator stays visible.

  socket.on(
    ClientEvents.TYPING_START,
    safeHandler<{ conversationId: string }>(socket, async (payload) => {

      const parsed = z.object({ conversationId: z.string().uuid() }).safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", "conversationId must be a valid UUID");
        return;
      }

      // Rate-limit typing events — they are cheap but can be spammed.
      const rateResult = await checkSocketRateLimit(socket.data.userId, NOISE_LIMIT, NOISE_WINDOW_S);
      if (!rateResult.allowed) {
        // Silently ignore — do not emit an error for typing spam.
        // A real user will never hit this; a script will be silently throttled.
        return;
      }
      const { conversationId } = parsed.data;
      const userId: string = socket.data.userId;


      // Check membership — a non-member should not be able to fake a typing indicator.
      const member = await isParticipant(userId, conversationId);
      if (!member) {
        emitError(socket, "NOT_MEMBER", "You are not a participant in this conversation");
        return;
      }

      // Write the typing key. SET with EX = set with expiry in seconds.
      // "NX" is NOT used here — we WANT to overwrite so the TTL is refreshed.
      await redisClient.set(typingKey(conversationId, userId), "1", {
        EX: TYPING_TTL_SECONDS,
      });

      // Broadcast the current list of typers to the conversation room.
      await broadcastTypers(io, conversationId);
    }),
  );


  // ── typing:stop ──────────────────────────────────────────────────────────────
  // Client sends this when the user clears the input or sends the message.
  // We delete the key immediately (instead of waiting for the 5-second TTL).

  socket.on(
    ClientEvents.TYPING_STOP,
    safeHandler<{ conversationId: string }>(socket, async (payload) => {

      const parsed = z.object({ conversationId: z.string().uuid() }).safeParse(payload);
      if (!parsed.success) {
        emitError(socket, "VALIDATION_ERROR", "conversationId must be a valid UUID");
        return;
      }

      const { conversationId } = parsed.data;
      const userId: string = socket.data.userId;

      // Delete the typing key immediately.
      await redisClient.del(typingKey(conversationId, userId));

      // Broadcast the updated (now empty or shorter) list.
      await broadcastTypers(io, conversationId);
    }),
  );
}


// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Reads all currently active typing keys for a conversation from Redis,
 * extracts the user IDs, and broadcasts the list to everyone in the room.
 */
async function broadcastTypers(io: Server, conversationId: string): Promise<void> {
  // Find all keys that match the pattern  typing:{conversationId}:*
  // Each matching key = one user currently typing.
  const keys = await redisClient.keys(typingPattern(conversationId));

  // Extract the userId from the end of each key.
  // Key format is "typing:{conversationId}:{userId}" — we split and take the last part.
  const typerIds = keys.map((key) => key.split(":").at(-1) as string);

  // Send the current list to everyone in the conversation room.
  io.to(conversationId).emit(ServerEvents.TYPING_UPDATE, {
    conversationId,
    typerIds,   // e.g. ["user-id-111", "user-id-222"]
  });
}