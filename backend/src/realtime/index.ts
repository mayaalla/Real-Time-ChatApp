// import { Server } from "socket.io";
// import type { Server as HttpServer } from "node:http";
// import { env } from "../config/env.js";
import { socketAuthMiddleware } from "./middleware/socketAuth.js";
import { registerPresenceHandlers } from "./handlers/presence.js";
import { registerMessageHandlers } from "./handlers/message.js";
import { registerReceiptHandlers } from "./handlers/receipts.js";
// import { registerMessageHandlers }  from "./handlers/message.js";
import { registerTypingHandlers }   from "./handlers/typing.js";
import { redisClient } from "../redis/client.js";
// import { registerReceiptHandlers }  from "./handlers/receipts.js";
import { registerSyncHandlers }     from "./handlers/sync.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { redisPublisher, redisSubscriber } from "../redis/client.js";
// let io: Server;

// export function initSocketServer(httpServer: HttpServer): Server {
//   io = new Server(httpServer, {
//     cors: {
//       origin:      env.CORS_ORIGIN,
//       credentials: true,
//     },
//     pingInterval: 10_000,
//     pingTimeout:  5_000,
//   });

//   console.log("Socket.IO server created");

//   // ── Auth middleware (runs before any event) ──────────────────────────────
//   io.use(socketAuthMiddleware);

//   // ── Handle new connections ───────────────────────────────────────────────
//   io.on("connection", (socket) => {
//     console.log(`✓ ${socket.data.username} connected [${socket.id}]`);

//     // Register all handlers — one function per topic
//     registerPresenceHandlers(io, socket);
//     registerMessageHandlers(io, socket);
//     registerTypingHandlers(io, socket);
//     registerReceiptHandlers(io, socket);
//     registerSyncHandlers(io, socket);
//   });

//   return io;
// }

// export function getIo(): Server {
//   if (!io) {
//     throw new Error("Socket server not initialised. Call initSocketServer() first.");
//   }
//   return io;
// }


import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { env } from "../config/env.js";


let io: Server; // the scoket server instant

export function initSocketServer(httpServer: HttpServer): Server{
  io = new Server(httpServer, {
    // CORS configuration
    cors:{
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
    // How often to send a "ping" to check if the browser is still there.
    // If the browser doesn't reply in time, the connection is considered dead.
    pingInterval: 10_000,
    pingTimeout: 5_000,
  })
  

  // redis adapter
  io.adapter(createAdapter(redisPublisher, redisSubscriber));
  console.log("[Socket.IO] Redis adapter attached.");

  console.log("Socket.IO server created");

  io.use(socketAuthMiddleware);


  io.on("connection", (socket) => {
    registerPresenceHandlers(io, socket);
    registerTypingHandlers(io, socket);    // ← add this line
    registerMessageHandlers(io, socket);
    registerReceiptHandlers(io, socket);
    registerSyncHandlers(io, socket);
  });

  
  return io;
}


export function getIo(): Server {
  if (!io) {
    throw new Error("Socket server not initialised. Call initSocketServer() first.");
  }
  return io;
}

