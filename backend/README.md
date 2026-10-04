# ChatApp — Backend

> A production-grade real-time chat server built with Node.js, TypeScript, PostgreSQL, and WebSockets.
> Built as a portfolio project to demonstrate backend engineering skills.

---

## What Is This?

This is the **server-side** of a full-stack real-time chat application.

Think WhatsApp or Slack — users can sign up, log in, create conversations (private or group), send messages, and see who's typing or online. The server handles all of that.

It's not finished yet — this is a **work-in-progress portfolio project**, built step by step following a 28-part build plan. The authentication system is complete and working. The messaging and real-time layers are next.

---

## Tech Stack

| What | Tool | Why |
|------|------|-----|
| Runtime | **Node.js 20** | Industry standard, non-blocking I/O for high concurrency |
| Language | **TypeScript 5** (strict mode) | Catches bugs at compile time, makes refactoring safe |
| HTTP Framework | **Express 5** | Simple, battle-tested, built-in async error handling in v5 |
| Database | **PostgreSQL** via [Neon](https://neon.tech) | Relational data model fits chat (users, conversations, messages) |
| ORM | **Prisma 7** | Type-safe DB queries, auto-generated client, easy migrations |
| Auth | **JWT** (jsonwebtoken 9) | Stateless, scalable — two token types with two separate secrets |
| Passwords | **bcrypt** (cost factor 12) | Industry standard, ~250ms per hash — slow enough to be safe |
| Validation | **Zod 4** | Runtime type checking with TypeScript inference, zero boilerplate |
| Real-time | **Socket.IO 4** | WebSocket server with fallback, rooms, and namespace support |
| Pub/Sub + Cache | **Redis** | Cross-instance broadcasting, presence tracking, rate limiting |
| Logging | **pino-http** | Fast structured JSON logging with sensitive header redaction |
| Dev runner | **tsx** | Hot-reload TypeScript without a build step |

---

## Project Layout

```
backend/
├── src/
│   ├── app.ts                  # Express app setup (middleware, routes)
│   ├── server.ts               # HTTP server entry point, graceful shutdown
│   │
│   ├── config/
│   │   └── env.ts              # All env vars validated at startup — app won't start with bad config
│   │
│   ├── db/
│   │   └── prisma.ts           # Single Prisma client (shared across the whole app)
│   │
│   ├── middleware/
│   │   ├── authenticate.ts     # JWT token guard — protects routes
│   │   ├── validate.ts         # Zod request validation middleware
│   │   ├── error.ts            # Global error handler
│   │   └── notFound.ts         # 404 catch-all
│   │
│   ├── modules/                # Feature modules (each has 4 files — see pattern below)
│   │   ├── auth/               # ✅ Complete: register, login, refresh, logout
│   │   ├── users/              # 🔲 Stub: get profile, search users
│   │   ├── conversations/      # 🔲 Stub: create/list/get conversations
│   │   └── messages/           # 🔲 Stub: message history, read receipts
│   │
│   ├── realtime/               # 🔲 Stub: Socket.IO server (real-time messaging)
│   │   ├── index.ts            # Socket.IO server + middleware
│   │   ├── events.ts           # Shared event name constants and payload types
│   │   ├── middleware/         # Socket authentication
│   │   └── handlers/           # One handler file per feature (messages, typing, presence...)
│   │
│   ├── redis/                  # 🔲 Stub: Redis client singleton
│   ├── types/                  # Custom TypeScript types
│   └── utils/                  # Shared helpers (tokens, passwords, rate limiting)
│
├── prisma/
│   ├── schema.prisma           # Database schema (6 models)
│   ├── seed.ts                 # Test data: 4 users, 2 conversations, 32 messages
│   └── migrations/             # Migration history
│
└── .env                        # Local secrets (not committed)
```

---

## Architecture Pattern — "Module" Structure

Every feature in this codebase follows the **same 4-file pattern**. This is intentional and strict:

```
feature/
  feature.routes.ts      → Lists URLs and middleware only. Zero logic.
  feature.controller.ts  → Reads the request, calls the service, sends the response.
                           No DB calls. No business logic.
  feature.service.ts     → All business logic and database access.
                           Knows nothing about HTTP (no req, no res).
  feature.schemas.ts     → Zod schemas for input validation and output shapes.
```

**Why this matters:** Each layer has one job. This makes it easy to test each piece in isolation, and easy for any engineer to find where code lives without asking.

---

## Database Schema

Six models in PostgreSQL:

```
User              → accounts (email, username, passwordHash, avatar, lastSeen)
Conversation      → a chat room (DM or group)
Participant       → join table: which user is in which conversation + their role
Message           → a single message (text body, attachments, soft-delete support)
Receipt           → read receipts: which user has read which message
RefreshToken      → stores active refresh tokens (used for session management)
```

### Key Database Decisions

#### 1. Message IDs are created by the client (not the server)

When a user sends a message, the **frontend generates the UUID** before sending it to the server.

**Why?** If the network drops and the client retries, the server receives the same UUID again. The database ignores the duplicate (upsert). Without this, every reconnect would create duplicate messages. This is one of the hardest bugs to fix after the fact — it's solved upfront here.

#### 2. Soft delete on messages

Deleted messages are **not removed from the database**. Instead, `deletedAt` is set, and the API returns a `"message deleted"` placeholder.

**Why?** Hard-deleting a message would break read receipt counts and break the ordering of message history. The row must stay.

#### 3. Cursor pagination (not page numbers)

Message history uses a **cursor** (pointer to a specific message in time), not page numbers like `?page=2`.

**Why?** Imagine you're on page 2. A new message arrives and shifts everything down by one. Now page 2 shows a duplicate of the last item on page 1. Cursors don't have this problem. They say "give me everything older than *this specific message*" — that never shifts.

#### 4. Refresh tokens stored in PostgreSQL (not Redis)

Most tutorials store refresh tokens in Redis because it's fast. This project stores them in Postgres.

**Why?** Easier to inspect (you can open Prisma Studio and see every active session), easier to revoke individual sessions, and there's one less dependency for a feature that doesn't need sub-millisecond speed.

#### 5. Participant table as the access control system

Before any user can read messages or join a socket room, **the `Participant` table is checked first**. There is one shared `isParticipant()` function used by both the REST API and the real-time socket handlers — never inlined, never duplicated.

---

## Authentication System

This is the most complete part of the project. Here's how it works end to end:

### Two types of tokens

| Token | Lives Where | Expires |
|-------|------------|---------|
| **Access token** | Client memory only (never localStorage) | 15 minutes |
| **Refresh token** | HttpOnly cookie (JS can't read it) | 7 days |

The access token is short-lived — if it's stolen, it expires quickly. The refresh token sits in a secure cookie that JavaScript can't touch, so XSS attacks can't steal it.

### Login / Register Flow

```
1. User sends email + password
2. Server finds user → runs bcrypt.compare (even if user doesn't exist — see security below)
3. Server creates access token + refresh token
4. Access token → sent in the response body
5. Refresh token → sent as an HttpOnly cookie (never touches JS)
6. Refresh token is also saved to the RefreshToken table in Postgres
```

### Staying Logged In

```
1. Every request: send access token in the Authorization header
2. Access token expires after 15 min → server returns { code: "TOKEN_EXPIRED" }
3. Client POSTs to /api/auth/refresh → cookie is sent automatically by the browser
4. Server validates cookie, checks DB, issues new token pair
5. Client retries the original request with the new access token
```

### Token Rotation

Every time a refresh token is used, it is **immediately revoked** and a new one is issued. If someone steals an old refresh token and tries to use it, the server sees it's revoked and refuses.

---

## Security Decisions

These are the security choices made in this codebase and why:

### Timing-safe login

```typescript
// Always run bcrypt.compare — even when the user doesn't exist
const hash = user ? user.passwordHash : DUMMY_HASH;
const isMatch = await bcrypt.compare(plain, hash);
```

**Why?** Without this, an attacker can measure response time: "that was fast → user doesn't exist. That was slow → user exists, wrong password." By always running bcrypt, both cases take the same ~250ms. No information leaks.

### No email enumeration

- Register: "already taken" — doesn't say if it was the email or username
- Login: "Invalid credentials" — same message for wrong email and wrong password

An attacker cannot probe the system to discover which emails are registered.

### Two separate JWT secrets

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are different secrets.

**Why?** If one secret leaks, the attacker can only forge that type of token. A leaked refresh secret cannot create valid access tokens.

### Never trust socket event payloads for user identity

```typescript
// ❌ Wrong — anyone can send a fake userId in the event
socket.on("message:send", (payload) => {
  const userId = payload.userId; // do NOT do this
});

// ✅ Correct — userId comes from the verified token, set at auth time
socket.on("message:send", (payload) => {
  const userId = socket.data.userId; // always use this
});
```

---

## Real-time Architecture (Socket.IO)

> Note: This is the next major piece to build. The architecture is designed and ready.

### Room Strategy

- **One room per conversation** — named by `conversationId`
- **One room per user** — named by `userId` (for cross-device notifications)

When a user opens a conversation, they join that conversation's room. The server broadcasts new messages, typing indicators, and read receipts to that room.

### Horizontal Scaling with Redis

```
Server Instance 1          Server Instance 2
   Alice connected            Bob connected
   |                          |
   └──── Redis Pub/Sub ───────┘
            ↑
   All instances share broadcasts through Redis.
   Without this, Alice's message never reaches Bob.
```

The `@socket.io/redis-adapter` package is already installed. When wired up, it lets multiple server instances behind a load balancer share the same Socket.IO state through Redis.

### Event Contract (Client ↔ Server)

**Client → Server:**

| Event | Payload | What it does |
|-------|---------|-------------|
| `conversation:join` | `{ conversationId }` | Join a chat room |
| `message:send` | `{ id, conversationId, textBody }` | Send a message |
| `message:read` | `{ conversationId, lastReadMessageId }` | Mark messages as read |
| `typing:start` | `{ conversationId }` | Show "Alice is typing..." |
| `typing:stop` | `{ conversationId }` | Hide typing indicator |
| `sync:since` | `{ conversationId, since }` | Catch up on missed messages |

**Server → Client:**

| Event | Payload | What it does |
|-------|---------|-------------|
| `message:new` | `{ message }` | New message received |
| `message:status` | `{ messageId, status }` | Message delivered/read |
| `typing:update` | `{ conversationId, username, isTyping }` | Typing state changed |
| `presence:update` | `{ userId, online, lastSeen }` | User online/offline |
| `conversation:created` | `{ conversation }` | New conversation started |

---

## API Reference

### Auth Routes (no token required)

| Method | Endpoint | What it does |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Log in, get tokens |
| `POST` | `/api/auth/refresh` | Exchange cookie for new access token |
| `POST` | `/api/auth/logout` | Revoke session, clear cookie |
| `GET` | `/api/health` | Check if server + DB are alive |

### User Routes (access token required)

| Method | Endpoint | Status | What it does |
|--------|----------|--------|-------------|
| `GET` | `/api/users/me` | 🔲 Coming soon | Get your own profile |
| `GET` | `/api/users?search=` | 🔲 Coming soon | Search users by username |
| `PATCH` | `/api/users/me` | 🔲 Coming soon | Update your profile |

### Conversation Routes (access token required)

| Method | Endpoint | Status | What it does |
|--------|----------|--------|-------------|
| `POST` | `/api/conversations` | 🔲 Coming soon | Create DM or group chat |
| `GET` | `/api/conversations` | 🔲 Coming soon | List your conversations |
| `GET` | `/api/conversations/:id` | 🔲 Coming soon | Get one conversation |

### Message Routes (access token required)

| Method | Endpoint | Status | What it does |
|--------|----------|--------|-------------|
| `GET` | `/api/conversations/:id/messages` | 🔲 Coming soon | Get message history (cursor paginated) |
| `POST` | `/api/conversations/:id/read` | 🔲 Coming soon | Mark messages as read |

### Response Format

Every response follows the same shape:

```json
// Success
{ "ok": true, "data": { ... } }

// Error
{ "ok": false, "code": "VALIDATION_ERROR", "message": "Validation failed", "errors": [...] }
```

### HTTP Error Codes Used

| Code | Meaning |
|------|---------|
| `400` | Bad request — invalid input |
| `401` | Not authenticated — missing or expired token |
| `403` | Forbidden — logged in, but not allowed |
| `404` | Not found |
| `409` | Conflict — email or username already taken |
| `429` | Too many requests — rate limited |
| `500` | Unexpected server error |
| `503` | Service unavailable — DB down |

---

## Running Locally

```bash
# Install dependencies
cd backend
npm install

# Set up environment variables
cp .env.example .env
# Fill in: DATABASE_URL, JWT_ACCESS_SECRET (32+ chars), JWT_REFRESH_SECRET (32+ chars)

# Run database migrations
npx prisma migrate dev

# Seed test data (4 users, 2 conversations, 32 messages)
npm run db:seed

# Start dev server with hot reload
npm run dev
# Server runs at http://localhost:4000
```

### Other Useful Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without compiling
npm run db:studio    # Open Prisma Studio (visual database browser)
npm run db:reset     # Wipe database, re-migrate, re-seed
```

### Test Data (after seeding)

| User | Email | Password |
|------|-------|----------|
| alice | alice@example.com | Password123! |
| bob | bob@example.com | Password123! |
| carol | carol@example.com | Password123! |
| dave | dave@example.com | Password123! |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (default: 4000) | Server port |
| `NODE_ENV` | No (default: development) | `development`, `test`, or `production` |
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string (pooled) |
| `DIRECT_URL` | ✅ Yes | PostgreSQL direct connection (for migrations) |
| `JWT_ACCESS_SECRET` | ✅ Yes (min 32 chars) | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | ✅ Yes (min 32 chars) | Secret for signing refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | No (default: 15m) | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | No (default: 7d) | Refresh token lifetime |
| `REDIS_URL` | Needed for real-time | Redis connection string |
| `CORS_ORIGIN` | No (default: localhost:5173) | Allowed frontend origin |

> **The server validates all environment variables on startup using Zod. It will refuse to start if anything is missing or wrong — no silent misconfigurations.**

---

## What's Done vs. What's Next

### ✅ Done (Parts 1–7 of 28)

- Project structure and TypeScript config
- Environment validation system
- Database schema (6 models, migrations complete)
- Password hashing utilities
- JWT token utilities (create, verify — both token types)
- Request validation middleware (Zod-based)
- JWT authentication middleware
- Rate limiting (per-IP, per-endpoint)
- Full auth module: register, login, refresh, logout
- Seed script with realistic test data

### 🔲 Coming Next (Parts 8–28)

- **Users module** — profile retrieval, user search
- **Conversations module** — create DMs and groups, list conversations
- **Messages module** — paginated message history, read receipts
- **File uploads** — signed URLs via Cloudinary
- **Redis client** — presence tracking, typing TTL
- **Socket.IO server** — full real-time messaging layer
- **Horizontal scaling** — Redis adapter for multi-instance deployment
- **Tests** — Vitest unit and integration tests

---

## Design Philosophy

A few principles that guide every decision in this codebase:

1. **Correctness over speed** — the harder problems (duplicate messages, timing-safe auth, token rotation) are solved before moving forward.

2. **One source of truth** — the `isParticipant()` access check, the `toPublicUser()` data shaper, the `verifyAccessToken()` helper — each exists in exactly one place.

3. **Fail loudly at startup, silently only when safe** — invalid config crashes the server with a clear error. Updating `lastSeen` after login fails silently (it's not critical).

4. **Privacy by default** — password hashes, emails of other users, and internal tokens never leave the server. The `PublicUser` shape is the only user object returned to clients.

---

## License

MIT — feel free to explore the code.

---

*Questions about the architecture? Open an issue or reach out.*
