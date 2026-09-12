import "dotenv/config";
import http from "node:http";
import { createApp } from "./app.js";
import { initRealtime } from "./realtime/index.js";

const app = createApp();
const server = http.createServer(app); // one server for both
initRealtime(server);                  // io.attach() lives here

const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
