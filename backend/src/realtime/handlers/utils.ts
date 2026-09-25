import type { Socket } from "socket.io";
import { ServerEvents } from "../events.js";

/**
 * Wraps an async socket handler in error protection.
 *
 * Usage:
 *   socket.on("message:send", safeHandler(socket, async (payload) => {
 *     // your logic here — if it throws, the error is caught automatically
 *   }));
 *
 * On error:
 *   • Emits "error" event back to the socket with a code and message
 *   • Logs full error on the server (for debugging)
 *   • Server process STAYS ALIVE
 */
export function safeHandler<T>(
  socket: Socket,
  handler: (payload: T) => Promise<void>,
): (payload: T) => void {
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

/**
 * Helper to emit a specific error code back to a socket.
 *
 * Usage:
 *   emitError(socket, "NOT_MEMBER", "You are not part of this conversation");
 */
export function emitError(socket: Socket, code: string, message: string): void {
  socket.emit(ServerEvents.ERROR, { code, message });
}