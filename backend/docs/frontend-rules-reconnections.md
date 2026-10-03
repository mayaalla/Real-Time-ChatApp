STEP 16.3 — MAKE THE CLIENT RECONNECT PROPERLY (FRONTEND RULES)
================================================================================

This step is RULES for the frontend (React side), not backend code.
Write these rules in a doc so you have them when you build the frontend.

─────────────────────────────────────────────────────────────────────────────
ACTION: Create the file  backend/docs/reconnection.md
─────────────────────────────────────────────────────────────────────────────

────────────────── PASTE THIS INTO  backend/docs/reconnection.md  ────────────

# Frontend Reconnection Rules

## Rule 1 — Use Socket.IO's built-in reconnect, do not write your own.

Socket.IO reconnects automatically. Configure it like this when creating the socket:

```js
const socket = io("http://localhost:4000", {
  auth: { token: getAccessToken() },
  reconnection:      true,
  reconnectionDelay:     1_000,   // start with 1 second
  reconnectionDelayMax: 10_000,   // never wait longer than 10 seconds
  reconnectionAttempts:     Infinity,  // keep trying forever
});
```

Do NOT set reconnectionAttempts to a small number or the app will
give up after a few tries and show a broken state.


## Rule 2 — On every successful reconnect, re-join rooms and sync.

```js
socket.on("connect", () => {
  // If a conversation is currently open, re-join its room.
  if (currentConversationId) {
    socket.emit("conversation:join", { conversationId: currentConversationId });

    // Then immediately ask for any missed messages.
    const lastMessageId = getLastMessageIdForConversation(currentConversationId);
    if (lastMessageId) {
      socket.emit("sync:since", {
        conversationId: currentConversationId,
        since: lastMessageId,
      });
    }
  }

  // Also fetch current presence of all contacts.
  socket.emit("presence:fetch");
});
```

Note: the "connect" event fires on FIRST connect AND on every reconnect.
So this code runs correctly in both cases.


## Rule 3 — Handle sync:reload by falling back to the REST endpoint.

```js
socket.on("sync:reload", ({ conversationId }) => {
  // The server says there are too many missed messages to sync over socket.
  // Reload the conversation from the REST API:
  //   GET /api/conversations/{conversationId}/messages
  fetchConversationHistory(conversationId);
});
```


## Rule 4 — Handle sync:messages by appending to the local store.

```js
socket.on("sync:messages", ({ conversationId, messages }) => {
  for (const message of messages) {
    // De-duplicate: only add if this ID is not already in the local list.
    if (!messageExistsLocally(message.id)) {
      addMessageToStore(conversationId, message);
    }
  }
});
```


## Rule 5 — Handle expired tokens during reconnect.

If the access token expired while the user was offline, Socket.IO's reconnect
will be refused by the server (auth middleware rejects it).

Listen for auth errors and refresh the token first:

```js
socket.on("connect_error", async (err) => {
  if (err.message === "TOKEN_EXPIRED") {
    // The access token expired. Refresh it first.
    await refreshAccessToken();
    // Update the auth token for the next reconnect attempt.
    socket.auth = { token: getAccessToken() };
    // Socket.IO will automatically retry the connection.
  }
});
```

STEP 16.4 — HANDLE MESSAGES SENT WHILE OFFLINE (FRONTEND RULES)
================================================================================

THE PROBLEM:
  Alice is offline. She types 3 messages and hits Send on each one.
  Her local app queues them (they cannot go out yet).
  When she reconnects, the 3 messages are sent in order.
  Because each message has a client-generated UUID (see context.txt Part 2.3),
  even if one message somehow arrived before the disconnection, sending it
  again will NOT create a duplicate — the server uses upsert.

─────────────────────────────────────────────────────────────────────────────
ACTION: Add these rules to  backend/docs/reconnection.md
        (append at the bottom of the file you just created)
─────────────────────────────────────────────────────────────────────────────

────────────────── APPEND THIS TO  backend/docs/reconnection.md  ─────────────

---

## Offline Message Queue Rules

### Rule 6 — Generate the UUID on the client BEFORE sending.

When the user hits Send, immediately:
1. Generate a UUID for the message (use the `uuid` npm package).
2. Add the message to the local store with status "PENDING".
3. Try to send it via  socket.emit("message:send", payload).
4. If the socket is offline, save the message to a queue (array in memory or localStorage).

### Rule 7 — On reconnect, flush the queue in order.

```js
socket.on("connect", async () => {
  // ... re-join rooms, sync, etc. (from Rule 2) ...

  // Then flush the offline queue.
  const queue = getOfflineMessageQueue();   // read from localStorage or memory
  for (const msg of queue) {
    socket.emit("message:send", msg);
    // The server's upsert means sending the same UUID twice is harmless.
  }
  clearOfflineMessageQueue();
});
```

### Rule 8 — Mark failed messages visually.

If a message fails permanently (the server responds with an error event
after sending), mark it "FAILED" in the UI with a Retry button.
Do NOT silently drop it.

```js
socket.on("error", ({ code, messageId }) => {
  if (messageId) {
    markMessageFailed(messageId);   // show retry button in UI
  }
});
```

### Rule 9 — Do NOT generate a new UUID on retry.

If the user clicks Retry, resend the SAME message with the SAME UUID.
The server's upsert handles it. If you generate a new UUID on retry,
you risk creating a duplicate message in the database.