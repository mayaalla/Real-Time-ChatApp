# ChatApp — Backend

Real-time chat backend built with Node.js, TypeScript, PostgreSQL, and Socket.IO.
Still in progress — auth is done, messaging and real-time are next.

---

## What is this?

It's the backend of a chat app — think WhatsApp without the mobile client. Users register, log in, open conversations, and exchange messages in real time.

I'm building it step by step following a 28-part plan I wrote before touching any code. The idea was: figure out every edge case on paper first, then build. So far parts 1–7 are done, which covers the entire infrastructure and auth system.

---

## Stack

| Layer | Tool | My take |
|-------|------|---------|
| Runtime | Node.js 20 | Non-blocking I/O is the right call for a chat server — requests spend most of their time waiting on DB/socket, not CPU |
| Language | TypeScript 5 strict | Strict mode is annoying for 10 minutes and saves hours every week after that |
| Framework | Express 5 | v5 finally auto-forwards async errors — no more wrapping every handler in try/catch |
| Database | PostgreSQL (Neon) | Chat data is relational — users, conversations, participants, messages. It fits naturally |
| ORM | Prisma 7 | Type-safe queries + auto-generated client. Migrations are painless |
| Auth | JWT | Two token types, two separate secrets. Stateless, works across instances |
| Passwords | bcrypt (cost 12) | ~250ms per hash on purpose — makes brute force expensive |
| Validation | Zod 4 | Validates at runtime AND gives you the TypeScript types for free |
| Real-time | Socket.IO 4 | WebSocket with fallback, built-in rooms, middleware support |
| Scaling | Redis + redis-adapter | Without this, two server instances can't talk to each other's sockets |
| Logging | pino-http | Fast, structured, auto-redacts auth headers |

---

## Folder structure

```
backend/
├── src/
│   ├── app.ts                  # Express setup — middleware order, routes
│   ├── server.ts               # Entry point — HTTP server, graceful shutdown
│   │
│   ├── config/
│   │   └── env.ts              # Zod validates every env var at startup. Bad config = crash with clear message.
│   │
│   ├── db/
│   │   └── prisma.ts           # One Prisma instance, shared everywhere. Never create one per request.
│   │
│   ├── middleware/
│   │   ├── authenticate.ts     # Reads JWT from Authorization header, attaches user to req
│   │   ├── validate.ts         # Runs Zod on req.body / params / query before the handler runs
│   │   ├── error.ts            # Global error handler
│   │   └── notFound.ts         # 404 fallback
│   │
│   ├── modules/
│   │   ├── auth/               # ✅ done — register, login, token refresh, logout
│   │   ├── users/              # 🔲 next — get profile, search by username
│   │   ├── conversations/      # 🔲 next — create DM/group, list, get
│   │   └── messages/           # 🔲 next — paginated history, read receipts
│   │
│   ├── realtime/               # 🔲 next — full Socket.IO layer
│   │   ├── index.ts            # Creates the io server
│   │   ├── events.ts           # All event name constants live here — no magic strings anywhere
│   │   ├── middleware/         # Socket auth (same JWT check as REST)
│   │   └── handlers/           # message, typing, presence, receipts, sync
│   │
│   ├── redis/                  # 🔲 next — publisher + subscriber clients
│   ├── types/                  # AuthenticatedRequest and similar types
│   └── utils/                  # token helpers, password helpers, rate limiter
│
├── prisma/
│   ├── schema.prisma           # 6 models, fully migrated
│   ├── seed.ts                 # 4 users, 2 conversations, 32 messages for local testing
│   └── migrations/
│
└── .env
```

---

## Module pattern — same 4 files everywhere

Every feature follows the exact same structure:

```
auth.routes.ts      → route list only, zero logic
auth.controller.ts  → reads req, calls service, sends res. No DB. No business logic.
auth.service.ts     → all the real work. Knows nothing about HTTP (no req, no res, no status codes).
auth.schemas.ts     → Zod schemas for inputs + the output shape clients receive
```

I picked this pattern because it makes the codebase predictable. If you know where to look in `auth/`, you know where to look in `messages/`. No surprises.

---

## Database — 6 models

```
User           → email, username, passwordHash, avatar, lastSeen
Conversation   → a chat (DM or group), has a name only if it's a group
Participant    → who's in which conversation, and their role (OWNER / ADMIN / MEMBER)
Message        → text, optional attachments, soft delete, edit history
Receipt        → one row per user per message when they read it
RefreshToken   → active sessions — stored in Postgres, not Redis
```

### Decisions worth explaining

**Message IDs come from the client, not the server.**

The frontend generates the UUID before sending. If the connection drops mid-send and the client retries, the server gets the same UUID and ignores the duplicate. If the server generated IDs, every retry would save a second copy of the message. I've seen this bug in production apps — it's subtle and annoying to fix retroactively.

**Deleted messages stay in the database.**

Setting `deletedAt` instead of hard-deleting. The row has to stay for read receipt counts and message ordering to stay correct. The API returns `"message deleted"` as the text body instead.

**Cursor pagination, not page numbers.**

Page 2 means nothing in a live chat — new messages arrive constantly and shift everything. A cursor says "give me everything older than this specific message ID" — that's stable no matter how many new messages come in.

**Refresh tokens live in Postgres.**

Most examples use Redis for this. I went with Postgres because you can open Prisma Studio and see every active session per user. Revoking one session is a single row update. Redis would be faster, but this doesn't need to be fast — refresh happens at most once every 15 minutes.

**`isParticipant()` is one shared function.**

Before reading messages or joining a socket room, the server checks the Participant table. That check lives in one function, called from both the REST handlers and the socket handlers. Inlining it in multiple places is how authorization bugs happen.

---

## Auth — how it works

### Two tokens, two jobs

| Token | Stored | Expires |
|-------|--------|---------|
| Access token | Client memory only — never localStorage | 15 min |
| Refresh token | HttpOnly cookie — JS can't touch it | 7 days |

Short access tokens mean a stolen token is useless within minutes. The refresh token in an HttpOnly cookie means XSS can't steal it — JavaScript literally cannot read it.

### Login flow

```
POST /api/auth/login
  → find user by email or username
  → run bcrypt.compare (always runs even if user doesn't exist)
  → return access token in response body
  → set refresh token as HttpOnly cookie
  → save refresh token to RefreshToken table
```

### When the access token expires

```
→ server returns { code: "TOKEN_EXPIRED" }
→ client posts to /api/auth/refresh (browser sends cookie automatically)
→ server checks cookie: valid JWT? exists in DB? not revoked?
→ server revokes old token, issues fresh pair
→ client retries original request
```

### Token rotation

Every use of a refresh token immediately invalidates it and creates a new one. Replaying an old token returns 401. This makes stolen tokens a one-shot weapon at most.

---

## Security choices

### Login always runs bcrypt — even for missing users

```typescript
const hash = user ? user.passwordHash : DUMMY_HASH;
const isMatch = await bcrypt.compare(plain, hash);
```

If you skip bcrypt when the user isn't found, the response is instant. An attacker times the request and knows the email doesn't exist. With this, both paths take ~250ms. Same response time, same error message.

### Register and login return the same error message

- Register: "already taken" — not "email taken" or "username taken"
- Login: "Invalid credentials" — not "wrong password" or "no account with that email"

Giving different messages for different failures lets attackers enumerate users. A uniform message gives nothing away.

### Two JWT secrets

`JWT_ACCESS_SECRET` ≠ `JWT_REFRESH_SECRET`. If one leaks, the attacker can only forge that token type. A leaked refresh secret still can't create valid access tokens.

### Socket identity comes from the token, not the event payload

```typescript
// ❌ anyone can put whatever userId they want in the payload
const userId = payload.userId;

// ✅ this was set by the auth middleware at connection time
const userId = socket.data.userId;
```

---

## Real-time layer (Socket.IO)

Not built yet, but the design is settled.

### Rooms

- One room per conversation: `conversationId`
- One room per user: `userId` (used for cross-device notifications)

Opening a conversation → join the room → receive messages, typing events, read receipts for that conversation.

### Scaling with Redis

```
Instance 1 (Alice connected)      Instance 2 (Bob connected)
         \                               /
          └────── Redis pub/sub ────────┘

Alice sends a message → Instance 1 publishes to Redis
→ Instance 2 receives it → forwards to Bob's socket
```

Without the Redis adapter, two instances are isolated islands. Alice's message never reaches Bob if they're on different instances. The package is installed, just needs wiring.

### Events

**Client → Server**

| Event | Payload |
|-------|---------|
| `conversation:join` | `{ conversationId }` |
| `message:send` | `{ id, conversationId, textBody }` |
| `message:read` | `{ conversationId, lastReadMessageId }` |
| `typing:start` | `{ conversationId }` |
| `typing:stop` | `{ conversationId }` |
| `sync:since` | `{ conversationId, since }` |

**Server → Client**

| Event | Payload |
|-------|---------|
| `message:new` | `{ message }` |
| `message:status` | `{ messageId, status }` |
| `typing:update` | `{ conversationId, username, isTyping }` |
| `presence:update` | `{ userId, online, lastSeen }` |
| `conversation:created` | `{ conversation }` |

All event names are constants in `events.ts`. No raw strings in handlers.

---

## API routes

### Auth (public)

| Method | Endpoint | Notes |
|--------|----------|-------|
| `POST` | `/api/auth/register` | Rate limited (5 req / 15 min per IP) |
| `POST` | `/api/auth/login` | Rate limited |
| `POST` | `/api/auth/refresh` | Rate limited |
| `POST` | `/api/auth/logout` | No rate limit — always safe to call |
| `GET` | `/api/health` | DB ping + uptime |

### Users (token required)

| Method | Endpoint | Status |
|--------|----------|--------|
| `GET` | `/api/users/me` | 🔲 next |
| `GET` | `/api/users?search=` | 🔲 next |
| `PATCH` | `/api/users/me` | 🔲 next |

### Conversations (token required)

| Method | Endpoint | Status |
|--------|----------|--------|
| `POST` | `/api/conversations` | 🔲 next |
| `GET` | `/api/conversations` | 🔲 next |
| `GET` | `/api/conversations/:id` | 🔲 next |

### Messages (token required)

| Method | Endpoint | Status |
|--------|----------|--------|
| `GET` | `/api/conversations/:id/messages` | 🔲 next |
| `POST` | `/api/conversations/:id/read` | 🔲 next |

### Response shape

```json
// success
{ "ok": true, "data": { ... } }

// error
{ "ok": false, "code": "VALIDATION_ERROR", "message": "...", "errors": [...] }
```

---

### Full architactur of the backend :
[![Architecture diagram of mayaalla/real-time-chatapp](https://gitdiagram.com/mayaalla/real-time-chatapp/diagram.png)](https://gitdiagram.com/mayaalla/real-time-chatapp?utm_source=readme&utm_medium=picture)

%% Generated by https://gitdiagram.com/mayaalla/real-time-chatapp
flowchart TD

subgraph group_api["HTTP API"]
  node_app["Express App<br/>[app.ts]"]
  node_auth_routes["Auth Routes<br/>[auth.routes.ts]"]
  node_users_routes["User Routes<br/>[users.routes.ts]"]
  node_convo_routes["Conversation Routes"]
  node_message_routes["Message Routes<br/>[messages.routes.ts]"]
  node_upload_routes["Upload Routes<br/>[uploads.routes.ts]"]
end

subgraph group_identity["Identity and Profiles"]
  node_auth_ctrl["Auth Controller<br/>[auth.controller.ts]"]
  node_auth_service["Auth Service<br/>[auth.service.ts]"]
  node_auth_schema["Auth Schemas<br/>[auth.schemas.ts]"]
  node_users_ctrl["User Controller"]
  node_users_service["User Service<br/>[users.service.ts]"]
end

subgraph group_chat["Conversation and Messaging"]
  node_convo_ctrl["Conversation Controller"]
  node_convo_service["Conversation Service"]
  node_message_ctrl["Message Controller"]
  node_message_service["Message Service"]
  node_upload_ctrl["Upload Controller"]
  node_upload_service["Upload Service<br/>[uploads.service.ts]"]
end

subgraph group_live["Realtime"]
  node_realtime["Socket.IO Server<br/>[index.ts]"]
  node_socket_auth["Socket Auth<br/>[socketAuth.ts]"]
  node_live_message["Live Messages<br/>[message.ts]"]
  node_presence["Presence Handler<br/>[presence.ts]"]
  node_receipts["Receipt Handler<br/>[receipts.ts]"]
  node_typing["Typing Handler<br/>[typing.ts]"]
  node_sync["Sync Handler<br/>[sync.ts]"]
end

subgraph group_infra["Runtime Infrastructure"]
  node_db[("PostgreSQL via Prisma<br/>[prisma.ts]")]
  node_redis[("Redis Client<br/>[client.ts]")]
  node_token["JWT Utilities<br/>[token.ts]"]
  node_env["Environment Config<br/>[env.ts]"]
end

node_client(("API Client"))

node_client -->|"sends requests"| node_app
node_app -->|"mounts"| node_auth_routes
node_app -->|"mounts"| node_users_routes
node_app -->|"mounts"| node_convo_routes
node_app -->|"mounts"| node_message_routes
node_app -->|"mounts"| node_upload_routes
node_auth_routes -->|"routes to"| node_auth_ctrl
node_auth_routes -->|"validates with"| node_auth_schema
node_auth_ctrl -->|"calls"| node_auth_service
node_auth_service -->|"reads and writes"| node_db
node_auth_service -->|"issues tokens"| node_token
node_users_routes -->|"routes to"| node_users_ctrl
node_users_ctrl -->|"calls"| node_users_service
node_users_service -->|"reads and writes"| node_db
node_convo_routes -->|"routes to"| node_convo_ctrl
node_convo_ctrl -->|"calls"| node_convo_service
node_convo_service -->|"reads and writes"| node_db
node_message_routes -->|"routes to"| node_message_ctrl
node_message_ctrl -->|"calls"| node_message_service
node_message_service -->|"reads and writes"| node_db
node_message_service -->|"resolves attachments"| node_upload_service
node_upload_routes -->|"routes to"| node_upload_ctrl
node_upload_ctrl -->|"calls"| node_upload_service
node_upload_service -->|"reads and writes"| node_db
node_realtime -->|"registers"| node_socket_auth
node_realtime -->|"registers"| node_live_message
node_realtime -->|"registers"| node_presence
node_realtime -->|"registers"| node_receipts
node_realtime -->|"registers"| node_typing
node_realtime -->|"registers"| node_sync
node_socket_auth -->|"verifies tokens"| node_token
node_live_message -->|"uses conversation logic"| node_convo_service
node_live_message -->|"reads and writes"| node_db
node_realtime -->|"uses client"| node_redis
node_db -->|"configures connection"| node_env
node_redis -->|"reads settings"| node_env
node_token -->|"reads secrets"| node_env

click node_app "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/app.ts"
click node_auth_routes "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/auth/auth.routes.ts"
click node_auth_ctrl "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/auth/auth.controller.ts"
click node_auth_service "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/auth/auth.service.ts"
click node_auth_schema "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/auth/auth.schemas.ts"
click node_users_routes "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/users/users.routes.ts"
click node_users_ctrl "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/users/users.controller.ts"
click node_users_service "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/users/users.service.ts"
click node_convo_routes "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/conversations/conversations.routes.ts"
click node_convo_ctrl "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/conversations/conversations.controller.ts"
click node_convo_service "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/conversations/conversations.service.ts"
click node_message_routes "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/messages/messages.routes.ts"
click node_message_ctrl "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/messages/messages.controller.ts"
click node_message_service "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/messages/messages.service.ts"
click node_upload_routes "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/uploads/uploads.routes.ts"
click node_upload_ctrl "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/uploads/uploads.controller.ts"
click node_upload_service "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/modules/uploads/uploads.service.ts"
click node_realtime "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/realtime/index.ts"
click node_socket_auth "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/realtime/middleware/socketAuth.ts"
click node_live_message "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/realtime/handlers/message.ts"
click node_presence "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/realtime/handlers/presence.ts"
click node_receipts "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/realtime/handlers/receipts.ts"
click node_typing "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/realtime/handlers/typing.ts"
click node_sync "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/realtime/handlers/sync.ts"
click node_db "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/db/prisma.ts"
click node_redis "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/redis/client.ts"
click node_token "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/utils/token.ts"
click node_env "https://github.com/mayaalla/real-time-chatapp/blob/main/backend/src/config/env.ts"

classDef toneNeutral fill:#f8fafc,stroke:#334155,stroke-width:1.5px,color:#0f172a
classDef toneBlue fill:#dbeafe,stroke:#2563eb,stroke-width:1.5px,color:#172554
classDef toneAmber fill:#fef3c7,stroke:#d97706,stroke-width:1.5px,color:#78350f
classDef toneMint fill:#dcfce7,stroke:#16a34a,stroke-width:1.5px,color:#14532d
classDef toneRose fill:#ffe4e6,stroke:#e11d48,stroke-width:1.5px,color:#881337
classDef toneIndigo fill:#e0e7ff,stroke:#4f46e5,stroke-width:1.5px,color:#312e81
classDef toneTeal fill:#ccfbf1,stroke:#0f766e,stroke-width:1.5px,color:#134e4a
class node_app,node_auth_routes,node_users_routes,node_convo_routes,node_message_routes,node_upload_routes,node_client toneBlue
class node_auth_ctrl,node_auth_service,node_auth_schema,node_users_ctrl,node_users_service toneAmber
class node_convo_ctrl,node_convo_service,node_message_ctrl,node_message_service,node_upload_ctrl,node_upload_service toneMint
class node_realtime,node_socket_auth,node_live_message,node_presence,node_receipts,node_typing,node_sync toneRose
class node_db,node_redis,node_token,node_env toneIndigo
## Running it locally

```bash
cd backend
npm install

# copy and fill in the env file
cp .env.example .env

npx prisma migrate dev
npm run db:seed    # creates 4 test users + 2 conversations + 32 messages
npm run dev        # http://localhost:4000
```

```bash
npm run build        # compile to dist/
npm run typecheck    # type check without compiling
npm run db:studio    # Prisma Studio — visual DB browser
npm run db:reset     # wipe + migrate + seed from scratch
```

### Seed users

| username | email | password |
|----------|-------|----------|
| alice | alice@example.com | Password123! |
| bob | bob@example.com | Password123! |
| carol | carol@example.com | Password123! |
| dave | dave@example.com | Password123! |

---

## Environment variables

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | 4000 | |
| `NODE_ENV` | development | |
| `DATABASE_URL` | — | Neon pooled connection |
| `DIRECT_URL` | — | Neon direct — only used for migrations |
| `JWT_ACCESS_SECRET` | — | Must be 32+ chars, app won't start otherwise |
| `JWT_REFRESH_SECRET` | — | Same |
| `JWT_ACCESS_EXPIRES_IN` | 15m | |
| `JWT_REFRESH_EXPIRES_IN` | 7d | |
| `REDIS_URL` | — | Needed once Socket.IO is wired |
| `CORS_ORIGIN` | localhost:5173 | |

`env.ts` validates all of these with Zod on startup. Missing or invalid values crash the process immediately with a readable error — no silent misconfigurations.

---

## Progress

**Done (parts 1–7 of 28)**
- folder structure, TypeScript config, ESM setup
- env validation
- database schema + migrations
- bcrypt password helpers
- JWT token helpers (create + verify for both types)
- Zod validation middleware
- JWT auth middleware
- in-memory rate limiter (Redis upgrade planned)
- complete auth module: register, login, refresh, logout
- seed script

**Next (parts 8–28)**
- users module
- conversations module
- messages module
- file uploads (Cloudinary signed URLs)
- Redis client
- Socket.IO server + all event handlers
- Redis adapter for horizontal scaling
- Vitest tests

---

## License

MIT
