import type { Socket } from "socket.io";
import { ServerEvents } from "../events.js";


export function safeHandler<T>(socket:Socket, handler: (playload:T) => Promise<void>): (playload:T) => void {


  return (payload: T) => {
    handler(payload).catch((err: unknown) => {
      // Log the full error server-side (you see this, client doesn't)
      console.error(`Socket handler error [${socket.id}]:`, err);

      // Extract a friendly message
      const message = err instanceof Error ? err.message : "An unexpected error occurred";

      // Send a structured error event back to THIS socket only
      socket.emit(ServerEvents.ERROR, {
        code:    "HANDLER_ERROR",
        message,
      });
    });
  };



}
// helper to emit a specific error code back to socket
export function emitError(socket: Socket, code: string, message: string): void {
  socket.emit(ServerEvents.ERROR, { code, message });
}


// HOW TO USE safeHandler IN FUTURE STEPS:
//   Instead of writing:
//     socket.on("message:send", async (payload) => {
//       // dangerous — if this throws, server might crash
//     });

//   You write:
//     socket.on("message:send", safeHandler(socket, async (payload) => {
//       // safe — errors are caught and sent back as an error event
//     }));