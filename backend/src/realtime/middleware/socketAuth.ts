// import type { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../../utils/token.js";

// /**
//  * Socket.IO middleware: checks that the connecting client has a valid
//  * access token in socket.handshake.auth.token
//  *
//  * On success: attaches user info to socket.data so every handler can
//  *             read socket.data.userId and socket.data.username safely.
//  *
//  * On failure: calls next(error) which refuses the connection.
//  */


// export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
//     // Step 1: Read the token from the auth field (NOT from query string!)
//     const token = socket.handshake.auth?.token as string | undefined;
  
//     // Step 2: Is there even a token?
//     if (!token) {
//       return next(new Error("AUTH_MISSING: No token provided"));
//     }
  
//     // Step 3: Verify the token using the SAME helper the REST routes use
//     const result = verifyAccessToken(token);
  
//     // Step 4: If verification failed, refuse the connection
    // if (!result.ok) {
    //   return next(new Error(`AUTH_INVALID: ${result.error}`));
    // }
  
//     // Step 5: Token is good! Attach user info to socket.data
//     // From now on, every event handler reads socket.data.userId
//     // and socket.data.username — they NEVER trust what the client sends
//     // inside an event payload for identity.
//     socket.data.userId   = result.payload.sub;      // the user's UUID
//     socket.data.username = result.payload.username; // the user's display name
  
//     console.log(`Socket authenticated: ${socket.data.username} (${socket.id})`);
  
//     // Step 6: Let the connection proceed
//     next();
//   }


import type { Server, Socket } from "socket.io";

// check that the client has valid access token
// if yes send it's id and username to the socket.data object
// if no refuse the connection

export function socketAuthMiddleware(socket:Socket, next: (err?:Error) => void):void{
 // read the token from the auth field
  
  const token = socket.handshake.auth?.token as string | undefined;

  // is there even a toke?
  if (!token) {
    return next(new Error("AUTH_MISSING: No token provided"));
  }

  // verify the token

  const result = verifyAccessToken(token);
  if (!result.ok) {
    return next(new Error(`AUTH_INVALID: ${result.error}`));
  }

  // token is good attach user info
  socket.data.userId   = result.payload.sub;
  socket.data.username = result.payload.username;
  console.log(`Socket authenticated: ${socket.data.username} (${socket.id})`);

  // ✅ CRITICAL: Must call next() to allow the connection to proceed.
  // Without this call, Socket.IO hangs every client in the handshake forever.
  next();


}