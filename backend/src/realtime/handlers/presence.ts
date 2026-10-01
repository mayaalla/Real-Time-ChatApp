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


export function registerPresenceHandlers(io:Server, socket:Socket):void{
  const { userId, username } = socket.data as { userId: string; username: string };

  // on connect
  // create the room to send nutification to the user
  socket.join(`user:${userId}`);
  console.log(`${username} joined personal room user:${userId}`);

  // TODO (Part 15): Add socket.id to Redis presence set for this user
  // TODO (Part 15): Broadcast presence:update (user is now online)


  //disconnect
  socket.on("disconnect", async (reason) =>{
    console.log(`${username} disconnected: ${reason}`);
    
    //update the last-seen time in the db
    try{
      await prisma.user.update({
        where:{id:userId},
        data:{lastSeen: new Date()},
      })
    }catch (err) {
      // Don't crash the server if this update fails — it's not critical
      console.error("Failed to update lastSeen on disconnect:", err);
    }

    // TODO (Part 15): Remove socket.id from Redis presence set
    // TODO (Part 15): If set is now empty → broadcast user is offline
  })

}