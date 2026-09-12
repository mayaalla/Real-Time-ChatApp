import http from "node:http";
import { createApp } from "./app.js";

const server = http.createServer(createApp());
const PORT = Number(process.env.PORT ?? 4000);
server.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
