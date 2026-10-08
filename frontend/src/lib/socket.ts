import { io, Socket } from "socket.io-client";
const SOCKET_URL = import.meta.env.VITE_API_URL as string;

export const socket: Socket = io(SOCKET_URL, {
  // Do not connect automatically on import.
  // We call socket.connect() manually after the user logs in.
  autoConnect: false,

  // Token placeholder — updated before each connection.
  // useSocketConnection sets socket.auth = { token: <real token> }
  // before calling socket.connect().
  auth: { token: "" },

  // REQUIRED: skip HTTP polling, use WebSocket directly.
  // The backend is designed for WebSocket only (no sticky sessions).
  transports: ["websocket"],

  // Reconnection settings
  reconnection:           true,
  reconnectionDelay:      1_000,    // wait 1s before first retry
  reconnectionDelayMax:   10_000,   // wait at most 10s between retries
  reconnectionAttempts:   Infinity, // keep trying forever
});
