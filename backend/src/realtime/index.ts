import { Server } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { env } from "../config/env.js";
import { socketAuthMiddleware } from "./middleware/socketAuth.js";
import { registerPresenceHandlers } from "./handlers/presence.js";
import { registerMessageHandlers }  from "./handlers/message.js";
import { registerTypingHandlers }   from "./handlers/typing.js";
import { registerReceiptHandlers }  from "./handlers/receipts.js";
import { registerSyncHandlers }     from "./handlers/sync.js";

let io: Server;

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin:      env.CORS_ORIGIN,
      credentials: true,
    },
    pingInterval: 10_000,
    pingTimeout:  5_000,
  });

  console.log("Socket.IO server created");

  // ── Auth middleware (runs before any event) ──────────────────────────────
  io.use(socketAuthMiddleware);

  // ── Handle new connections ───────────────────────────────────────────────
  io.on("connection", (socket) => {
    console.log(`✓ ${socket.data.username} connected [${socket.id}]`);

    // Register all handlers — one function per topic
    registerPresenceHandlers(io, socket);
    registerMessageHandlers(io, socket);
    registerTypingHandlers(io, socket);
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