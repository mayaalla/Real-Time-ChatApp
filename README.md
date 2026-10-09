# Hadra (هدرة)

Hadra is a browser-based chat app for one-to-one and group conversations. It lets people exchange messages in real time while keeping delivery status, unread activity, and conversation history in sync. The name comes from the Algerian Darija word for “talk.”

**Live demo:** https://real-time-chat-app-xi-liart.vercel.app/
Test user : text@example.com      Password: testtest

![Hadra chat interface showing a conversation, message status, and the conversation list](chat.png)

## Features

- Register, sign in, search for people, and start private or group conversations.
- Send messages instantly with online presence, typing indicators, delivery and read status, and unread counts.
- Edit or delete your own messages and load older messages as you scroll.
- Reconnect after a dropped connection and synchronize missed messages without duplicating them.
- Share image or document attachments when Cloudinary is configured.

## Tech stack and decisions

- **Frontend:** React, TypeScript, Vite, and Tailwind CSS build the interface. Zustand manages client state, while TanStack Query manages server data.
- **API and real-time messaging:** Node.js and Express serve the API, Socket.IO delivers live updates, and Zod validates inputs.
- **Data and scaling:** PostgreSQL and Prisma model users, conversation membership, messages, and read receipts. Redis tracks presence and carries Socket.IO events between server instances.
- **Authentication:** Short-lived access tokens and refresh tokens in HTTP-only cookies keep sessions active.
- **Attachments:** The API issues signed upload details so files can upload directly to Cloudinary.

### Engineering decisions

- I load older messages using a cursor, so new messages do not shift the next batch of history.
- I mark deleted messages instead of removing their rows. This keeps chat order and read receipts intact.
- I check conversation membership before someone reads messages or joins a live chat room.
- I store refresh tokens in PostgreSQL so I can revoke a session when someone logs out.

## Engineering highlight

**Challenge:** A connection can drop after a message reaches the server but before the sender receives confirmation. Retrying with a new ID would create a duplicate.

**Solution:** The client generates a message UUID before sending it. The Socket.IO handler [upserts by that ID](backend/src/realtime/handlers/message.ts), and the client [merges incoming messages by ID](frontend/src/utils/messageCache.ts).

**Result:** Retrying the same message reuses its database row, while the UI reconciles the optimistic message with the server response.

## Run locally

Requires **Node.js 22.12+** (or 20.19+), PostgreSQL, and Redis. Create an empty PostgreSQL database first. The commands below use the default frontend and API ports, **5173** and **4000**.

```bash
git clone https://github.com/mayaalla/Real-Time-ChatApp.git
cd Real-Time-ChatApp
```

Create `backend/.env` with your own connection strings and two **different** random JWT secrets of at least 32 characters. For local PostgreSQL, `DATABASE_URL` and `DIRECT_URL` can point to the same database; hosted providers may supply separate pooled and direct URLs.

```dotenv
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/hadra
DIRECT_URL=postgresql://USER:PASSWORD@localhost:5432/hadra
REDIS_URL=redis://localhost:6379
CORS_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
```

Generate secrets with `openssl rand -hex 32`. To enable attachments, also set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `backend/.env`.

Start the API in one terminal:

```bash
cd backend
npm ci
npm run db:generate
npm run db:deploy
npm run dev
```

Start the frontend in another terminal from the repository root:

```bash
cd frontend
npm ci
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Register two accounts in separate browser sessions to try a conversation. The frontend example file sets both the REST and Socket.IO URLs to `http://localhost:4000`.

## Tests

From `backend/`, run `npx vitest run` for the backend tests and `npm run typecheck` for TypeScript checking. From `frontend/`, run `npm run build` to check the frontend and produce a production build. The current backend suite covers conversation access, message edits and deletion, receipts, typing, and client message cache behavior. **All 32 tests, backend type checking, and the frontend build passed** during this README update.

## Limitations and next steps

No public deployment is linked here. Attachment uploads require your own Cloudinary credentials, and the current automated tests do not include an end-to-end browser flow. A deployed demo and browser-level tests are the next useful additions.

## Contact

[mayaalla on GitHub](https://github.com/mayaalla)
