// import type { Server, Socket } from "socket.io";
// import { prisma } from "../../db/prisma.js";

// /**
//  * Registers the connect/disconnect handlers for one socket.
//  *
//  * Called once per new connection from realtime/index.ts
//  */
// export function registerPresenceHandlers(io: Server, socket: Socket): void {
//   const { userId, username } = socket.data as { userId: string; username: string };

//   // ── ON CONNECT ─────────────────────────────────────────────────────────────
//   // Join the user's personal room.
//   // The room is named "user:{userId}" — the server can now send events to
//   // this specific person via:  io.to(`user:${userId}`).emit(...)
//   socket.join(`user:${userId}`);
//   console.log(`${username} joined personal room user:${userId}`);

//   // TODO (Part 15): Add socket.id to Redis presence set for this user
//   // TODO (Part 15): Broadcast presence:update (user is now online)

//   // ── ON DISCONNECT ──────────────────────────────────────────────────────────
//   socket.on("disconnect", async (reason) => {
//     console.log(`${username} disconnected: ${reason}`);

//     // Update last-seen time in the database
//     try {
//       await prisma.user.update({
//         where: { id: userId },
//         data:  { lastSeen: new Date() },
//       });
//     } catch (err) {
//       // Don't crash the server if this update fails — it's not critical
//       console.error("Failed to update lastSeen on disconnect:", err);
//     }

//     // TODO (Part 15): Remove socket.id from Redis presence set
//     // TODO (Part 15): If set is now empty → broadcast user is offline
//   });
// }


import type { Server, Socket } from "socket.io";
import { redisClient } from "../../redis/client.js";
import { prisma } from "../../db/prisma.js";
import { ServerEvents } from "../events.js";


// key name function (create the key names)
const presenceKey = (userId:string) => `presence:user:${userId}`
const onlineSetKey = () => `presence:online`;


// How long (in seconds) before a presence key expires if not refreshed.
// A crashed server cannot refresh keys, so users go offline automatically.
const PRESENCE_TTL_SECONDS = 60;

// How often (in milliseconds) we refresh the TTL to keep the user online.
// Must be less than PRESENCE_TTL_SECONDS.
const PRESENCE_REFRESH_INTERVAL_MS = 30_000;  // 30 seconds


export function registerPresenceHandlers(io: Server, socket: Socket): void {

  const userId:   string = socket.data.userId;
  const username: string = socket.data.username;

  // ── ON CONNECT ───────────────────────────────────────────────────────────────
  // We run this immediately when the socket is registered.
  void handleConnect(io, socket, userId);

  // ── PRESENCE REFRESH ─────────────────────────────────────────────────────────
  // Every 30 seconds, refresh the TTL on the presence key.
  // This tells Redis: "this user is still connected, don't expire the key yet".
  // If the server crashes, the interval stops, the TTL runs out, key disappears.
  const refreshInterval = setInterval(async () => {
    try {
      await redisClient.expire(presenceKey(userId), PRESENCE_TTL_SECONDS);
    } catch (err) {
      console.error(`[Presence] Failed to refresh TTL for ${username}:`, err);
    }
  }, PRESENCE_REFRESH_INTERVAL_MS);

  // ── ON DISCONNECT ────────────────────────────────────────────────────────────
  // This runs when the socket closes (browser tab closed, network lost, etc.)
  socket.on("disconnect", async () => {
    clearInterval(refreshInterval);  // Stop refreshing — user is gone.
    await handleDisconnect(io, socket, userId);
  });
}

async function handleConnect(io: Server, socket: Socket, userId: string): Promise<void> {
  try {
    // Add this socket ID to the user's presence set.
    // SADD = "Set Add". Creates the set if it doesn't exist.
    await redisClient.sAdd(presenceKey(userId), socket.id);

    // Set the TTL. If we don't do this, the key lives forever (even if server crashes).
    await redisClient.expire(presenceKey(userId), PRESENCE_TTL_SECONDS);

    // Also add to the global "who is online" set.
    await redisClient.sAdd(onlineSetKey(), userId);

    // Tell the socket to join its personal user room.
    // (This might already be done in index.ts — if so, remove this line to avoid duplication.)
    await socket.join(`user:${userId}`);

    // Broadcast "this user is online" to people who share a conversation with them.
    await broadcastPresence(io, userId, true, null);

    console.log(`[Presence] ${socket.data.username} connected (socket: ${socket.id})`);
  } catch (err) {
    console.error(`[Presence] handleConnect error for ${userId}:`, err);
  }
}

async function handleDisconnect(io: Server, socket: Socket, userId: string): Promise<void> {
  try {
    // Remove this socket ID from the user's presence set.
    // SREM = "Set Remove".
    await redisClient.sRem(presenceKey(userId), socket.id);

    // How many sockets does this user still have open?
    const remainingCount = await redisClient.sCard(presenceKey(userId));

    if (remainingCount === 0) {
      // No more open sockets — the user is fully offline.

      // Clean up the presence set and the global online set.
      await redisClient.del(presenceKey(userId));
      await redisClient.sRem(onlineSetKey(), userId);

      // Record the last-seen time in Postgres.
      const now = new Date();
      await prisma.user.update({
        where: { id: userId },
        data:  { lastSeen: now },
      });

      // Tell this user's contacts: they are now offline.
      await broadcastPresence(io, userId, false, now);

      console.log(`[Presence] ${socket.data.username} is now offline.`);
    } else {
      // User still has other tabs open — they are still online.
      console.log(`[Presence] ${socket.data.username} closed one tab (${remainingCount} remaining).`);
    }
  } catch (err) {
    console.error(`[Presence] handleDisconnect error for ${userId}:`, err);
  }
}

async function broadcastPresence(
  io:       Server,
  userId:   string,
  online:   boolean,
  lastSeen: Date | null,
): Promise<void> {
  // Find everyone who shares at least one conversation with this user.
  const participantRows = await prisma.participant.findMany({
    where: {
      conversation: {
        participants: { some: { userId } },  // "is in a conversation with userId"
      },
      userId: { not: userId },               // exclude the user themselves
    },
    select: { userId: true },
  });

  // De-duplicate (same person could share multiple conversations).
  const contactIds = [...new Set(participantRows.map((p) => p.userId))];

  const payload = {
    userId,
    online,
    lastSeen: lastSeen ? lastSeen.toISOString() : null,
  };

  for (const contactId of contactIds) {
    io.to(`user:${contactId}`).emit(ServerEvents.PRESENCE_UPDATE, payload);
  }
}

