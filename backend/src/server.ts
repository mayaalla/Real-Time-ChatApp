import http from "node:http";
import { createApp } from "./app.js";
import { prisma } from "./db/prisma.js";
import { initSocketServer } from "./realtime/index.js"; 
import { connectRedis } from "./redis/client.js";

const PORT = Number(process.env.PORT ?? 4000);
const ENV = process.env.NODE_ENV ?? "development";

const app = createApp();
const server = http.createServer(app);
initSocketServer(server);  

await connectRedis();
// Part 12 — Socket.IO gets attached to THIS server, right here.

const INSTANCE = process.env.INSTANCE_NAME ?? "instance-1";

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[${INSTANCE}] chat-server listening on http://localhost:${PORT} [${ENV}]`);
});

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received - shutting down`);

  server.close(async () => {
    try {
      await prisma.$disconnect();
      console.log("closed cleanly");
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("forced exit after 10s");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));