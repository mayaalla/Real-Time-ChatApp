<aside>
🧭

This is the complete build order for the chat app, written in plain English with zero code. Every folder, file, package, table, column, endpoint, event, environment variable and screen is named. Work top to bottom. Do not skip ahead — later parts assume earlier ones exist.

How to read a step: **Goal** = what you are producing, **Do** = the actions in order, **Done when** = how you know you can move on.

</aside>

## Part 0 — Get your machine and accounts ready

**Goal:** every tool the project needs is installed and proven to work before you write anything.

### Step 0.1 — Install the core tools

- Install **Node.js** version 20 or newer. This runs your backend.
- Install **npm** (it comes with Node). This installs packages.
- Install **Git**. This tracks your code history.
- Install **Docker Desktop**. This will run the database and Redis on your laptop without installing them directly.
- Install **Visual Studio Code** as your editor.
- Done when: each tool answers when you ask it for its version in a terminal, and Docker Desktop shows a green "running" state.

### Step 0.2 — Install the editor helpers

- Add the **ESLint** extension (marks mistakes while typing).
- Add the **Prettier** extension (formats files consistently).
- Add the **Prisma** extension (colours and checks your database schema file).
- Add the **Tailwind CSS IntelliSense** extension (suggests style class names on the frontend).
- Add **Docker** extension (see your running containers from the editor).
- Done when: opening a file shows syntax colours and saving a file reformats it.

### Step 0.3 — Install the testing-by-hand tools

- Install an API client: **Postman** or **Insomnia**. You use this to call your backend before any user interface exists.
- Install a database viewer: **TablePlus**, **DBeaver**, or plan to use **Prisma Studio** (comes free with Prisma). This lets you look at rows with your eyes.
- Optional but useful: a Redis viewer such as **RedisInsight**, to watch presence keys appear and expire.
- Done when: all three are open and you know where their "new connection" button is.

### Step 0.4 — Create the accounts you will need later

- **GitHub** account — code hosting.
- One deployment platform account: **Fly.io**, **Railway**, or **Render**. These are the three that keep long-lived socket connections alive.
- One file-storage account for attachments: **Cloudinary** (easiest) or **AWS S3** (more standard).
- Done when: you can log in to each one.

### Step 0.5 — Agree the rules of the project with yourself

- Write down the scope rule: only **two new technologies** are being studied — TypeScript and PostgreSQL. Redis and Docker are used, not studied.
- Write down the deferred list and promise not to install any of it: NestJS, Next.js, WebRTC video, end-to-end encryption, push notifications, message search, Kafka, GraphQL, Kubernetes.
- Done when: those two lists exist as a note you can re-read whenever you feel tempted.

## Part 1 — Create the repository and the empty project shells

**Goal:** one repository containing two projects (server and client) plus shared documents, with nothing secret inside it.

### Step 1.1 — Create the repository

- Create a folder on your computer called **chat-app**.
- Turn it into a Git repository.
- Create an empty repository on GitHub with the same name and connect the two.
- Done when: you can push an empty commit to GitHub and see it there.

### Step 1.2 — Create the top-level folder layout

- Inside **chat-app**, create a folder named **server** — this is the backend.
- Create a folder named **client** — this is the frontend.
- Create a folder named **docs** — this is where diagrams and notes live.
- Create a folder named **infra** — this is where the Docker files live.
- Done when: the four folders exist and the repository still pushes.

### Step 1.3 — Add the repository-level files

- Create **README.md** at the top level. For now write only the project name and one sentence describing it.
- Create **.gitignore** at the top level. It must ignore: the dependency folder (node modules), build output folders, all environment files, log files, and editor settings folders.
- Create **.editorconfig** so every machine uses the same indentation and line endings.
- Done when: you can confirm that a test environment file you create is *not* offered to Git.

### Step 1.4 — Start each project with its own package file

- Inside **server**, create a Node project. Name it **chat-server**. Mark it as private so it can never be published by accident.
- Inside **client**, you will create the project in Part 19 using the Vite starter, so leave it empty for now.
- Done when: the server folder has its own package file with the name chat-server.

### Step 1.5 — Decide your branch and commit habits

- Keep a **main** branch that always works.
- Make one branch per part, named after it, for example "part-07-authentication".
- Commit at the end of every step, with a message that says what now works, not what you touched.
- Done when: your first branch is created and merged back.

## Part 2 — Turn the backend into a TypeScript project

**Goal:** the server is written in TypeScript, runs while you edit it, and refuses to compile when types are wrong.

### Step 2.1 — Install the TypeScript toolchain

- Install as development-only dependencies: **typescript** (the compiler), **tsx** (runs TypeScript directly during development), **@types/node** (type descriptions for Node itself).
- Done when: the packages appear under development dependencies.

### Step 2.2 — Create the TypeScript configuration

- Create a file named **tsconfig.json** inside **server**.
- Turn on **strict** mode. This is the whole point of the exercise — it forbids sloppy types.
- Set the source folder to **src** and the output folder to **dist**.
- Target a modern JavaScript version that Node 20 understands.
- Turn on the setting that reports unused variables, and the one that forbids implicit "any".
- Optionally set up a path shortcut so that imports can start from the source root instead of long relative paths.
- Done when: asking the compiler to check the project reports zero errors on an empty project.

### Step 2.3 — Create the source folder skeleton

Inside **server/src**, create these folders and empty placeholder files, exactly with these names:

- **config/** — reads and validates environment variables, and holds constants.
- **db/** — one file that creates and shares the single database client.
- **redis/** — one file that creates the Redis clients.
- **modules/** — the feature areas, one folder each: **auth/**, **users/**, **conversations/**, **messages/**, **uploads/**.
- **realtime/** — everything socket related, containing: **index** (creates the socket server), **middleware/**, **handlers/**, and **events** (the shared list of event names and payload shapes).
- **middleware/** — shared request middleware: error handler, authentication guard, request validation.
- **types/** — shared type declarations used in more than one place.
- **utils/** — small helpers such as token creation and password hashing.
- **app** — builds the Express application, but does not start listening.
- **server** — starts the HTTP server and attaches the socket server to it.
- Done when: the folder tree matches the architecture page and the project still compiles.

<aside>
💡

Why **app** and **server** are two separate files: Express and Socket.IO must share **one** HTTP server. The app file only describes routes; the server file creates the real HTTP server from it and then attaches the socket layer to that same server. Splitting them also lets tests import the app without opening a network port.

</aside>

### Step 2.4 — Add the command shortcuts

In the server package file, define these named commands:

- **dev** — runs the server in watch mode so it restarts on save.
- **build** — compiles TypeScript into the dist folder.
- **start** — runs the compiled output (used in production).
- **typecheck** — checks types without producing files.
- **lint** — runs ESLint.
- **format** — runs Prettier.
- Later you will add **test**, and the Prisma commands **db:migrate**, **db:seed**, **db:studio**, **db:reset**.
- Done when: the dev command starts and the build command produces a dist folder.

### Step 2.5 — Add code quality tooling

- Install and configure **ESLint** with the TypeScript plugin.
- Install and configure **Prettier**, and make ESLint and Prettier agree so they do not fight.
- Optional: add **Husky** with a pre-commit hook that runs typecheck and lint, so broken code cannot be committed.
- Done when: lint passes on the empty project.

## Part 3 — Run Postgres and Redis locally with Docker Compose

**Goal:** one command boots your whole local infrastructure, and your data survives restarts.

### Step 3.1 — Write the Compose file

- Create **docker-compose.yml** inside the **infra** folder.
- Define a service named **postgres**: use the official Postgres image, version 16. Give it a database name (**chatapp**), a user, and a password. Map its port so your machine can reach it.
- Define a service named **redis**: use the official Redis image, version 7. Map its port.
- Done when: the file exists and Docker reports it as valid.

### Step 3.2 — Make the data persistent

- Add a named storage volume for Postgres, for example **postgres-data**, attached to the folder where Postgres keeps its files.
- Optionally add one for Redis if you want presence data to survive restarts (you do not need it — Redis data here is disposable by design).
- Done when: you can stop the containers, start them again, and your rows are still there.

### Step 3.3 — Add health checks and start order

- Add a health check to the Postgres service so Docker knows when it is genuinely ready to accept connections, not merely started.
- Add the same idea to Redis.
- Done when: the containers report a "healthy" status, not just "up".

### Step 3.4 — Prove both services work

- Connect to Postgres with your database viewer using host, port, database name, user and password. Create nothing; just connect.
- Connect to Redis with your Redis viewer or the command line inside the container, and run the simple "are you alive" check.
- Done when: both tools connect successfully. If they do not, fix it now — every later part depends on this.

### Step 3.5 — Write down the operating instructions

- In **docs**, create a short note named **local-setup** listing: the command to start the containers, the command to stop them, the command to wipe them, and the connection details.
- Done when: someone else could boot your environment using only that note.

## Part 4 — Configuration and secrets

**Goal:** the app reads every setting from the environment, and refuses to start if a setting is missing or malformed.

### Step 4.1 — List every setting the backend needs

Name them exactly like this:

- **NODE_ENV** — development, test or production.
- **PORT** — the port the backend listens on, for example 4000.
- **DATABASE_URL** — the full connection string for Postgres.
- **REDIS_URL** — the connection string for Redis.
- **JWT_ACCESS_SECRET** — the secret used to sign short-lived access tokens.
- **JWT_REFRESH_SECRET** — a *different* secret used to sign refresh tokens.
- **ACCESS_TOKEN_TTL** — how long an access token lives, for example fifteen minutes.
- **REFRESH_TOKEN_TTL** — how long a refresh token lives, for example thirty days.
- **CORS_ORIGIN** — the exact web address your frontend runs on.
- **COOKIE_DOMAIN** and **COOKIE_SECURE** — how the refresh cookie is scoped.
- Storage settings, depending on your choice: **CLOUDINARY_CLOUD_NAME**, **CLOUDINARY_API_KEY**, **CLOUDINARY_API_SECRET**; or **S3_BUCKET**, **S3_REGION**, **AWS_ACCESS_KEY_ID**, **AWS_SECRET_ACCESS_KEY**.
- **RATE_LIMIT_MESSAGES_PER_MINUTE** — your flood protection number, for example thirty.
- Done when: the list is complete and nothing else in your code will ever be hard-coded.

### Step 4.2 — Create the environment files

- Create **server/.env** with real local values. This file is ignored by Git forever.
- Create **server/.env.example** with the same keys but empty or fake values. This one *is* committed, so future-you knows what is required.
- Done when: the example file lists every key from Step 4.1.

### Step 4.3 — Validate the settings at startup

- Install **dotenv** to load the file, and **Zod** to describe the expected shape of the settings.
- In **config**, describe each setting: its type, whether it is required, and its default if any.
- Read the environment once, validate it, and export one frozen settings object. Every other file imports that object — nobody reads raw environment variables directly.
- Make the process stop immediately with a clear message listing which settings are wrong or missing.
- Done when: deleting one line from your environment file makes the server refuse to start and tell you exactly which key is missing.

### Step 4.4 — Add the constants file

- In **config**, keep the values that are not secrets but are used in several places: the default page size for message history (fifty), the typing indicator lifetime (about five seconds), the presence key lifetime, the cookie name for the refresh token, and the socket namespace name.
- Done when: no magic numbers remain scattered in feature code.

## Part 5 — Design and create the database with Prisma

**Goal:** the five tables from the architecture page exist in Postgres, created by versioned migrations, filled with believable test data.

### Step 5.1 — Install and initialise Prisma

- Install **prisma** as a development dependency and **@prisma/client** as a runtime dependency.
- Initialise Prisma. This creates a **prisma** folder containing **schema.prisma**.
- Point the schema at Postgres and tell it to read the connection string from **DATABASE_URL**.
- Done when: the schema file exists and mentions the Postgres provider.

### Step 5.2 — Describe the five tables in words before writing the schema

- **User** — one row per person. Holds: a unique identifier, email (unique), username (unique), the hashed password, an optional avatar address, the time they were last seen, and the creation time.
- **Conversation** — one row per chat. Holds: an identifier, a flag saying whether it is a group, an optional name (groups only), and the creation time. A one-to-one chat has no name.
- **Participant** — the join table that says "this user belongs to this conversation". Holds: an identifier, the user reference, the conversation reference, a role (owner, admin or member), and the join time. This table is what makes group chat possible and what you check before letting anyone into a room.
- **Message** — one row per message. Holds: an identifier **generated by the sending client**, the conversation reference, the sender reference, optional text body, optional attachment address, a status (sent, delivered, read), the creation time, and optional edited and deleted times.
- **Receipt** — one row per person per message they have read. Holds: the message reference, the user reference, and the time they read it. Its identity is the pair of message and user together, so nobody can be recorded twice for the same message.
- Done when: you can explain each table out loud without looking.

### Step 5.3 — Add the rules that protect the data

- Make the pair of user and conversation **unique** on Participant, so the same person cannot be added to a chat twice.
- Make email and username unique on User.
- Set deletion behaviour: deleting a conversation removes its participants and messages; deleting a message removes its receipts; deleting a user removes their participation records and receipts.
- Define the two lists of allowed values: roles (owner, admin, member) and message statuses (sent, delivered, read).
- Done when: your schema refuses impossible data instead of relying on your code to be careful.

### Step 5.4 — Add the indexes that keep it fast

- Add an index on Participant by conversation, so "who is in this chat" is instant.
- Add a combined index on Message by conversation together with creation time in descending order. This single index is what makes "give me the newest fifty messages, then the fifty before those" fast forever.
- Optionally add an index on Message by sender if you later build per-user views.
- Done when: both indexes appear in the generated migration file.

<aside>
🔑

The two non-obvious decisions, restated so you never undo them by accident: the **message identifier comes from the client**, which is what makes retries and reconnection re-sends harmless instead of creating duplicates; and the **combined conversation-plus-time index** is what makes paging through history cheap. Tutorials skip both and then wonder why their chat duplicates messages and slows down.

</aside>

### Step 5.5 — Create the first migration

- Ask Prisma to create a migration and name it **init**.
- Read the generated migration file before applying it. Confirm your tables, unique rules and indexes are there.
- Apply it to your local database.
- Done when: your database viewer shows five tables with the expected columns.

### Step 5.6 — Create the shared database client

- In **db**, create the single shared Prisma client and export it.
- Make it a singleton: during development, hot reloading must not create a new connection pool every time you save. Store it on a global reference so it is reused.
- Done when: restarting the dev server repeatedly does not leak connections.

### Step 5.7 — Write a seed script

- Create **prisma/seed** and register it in the package file.
- It should create: four users with known passwords (for example alice, bob, carol, dave), one one-to-one conversation between alice and bob, one group conversation containing all four, about thirty messages spread over the last few days, and some receipts so unread counts are not all zero.
- Done when: running the seed command twice does not crash and does not create duplicates (clear the tables first, or use safe upserts).

### Step 5.8 — Learn to inspect and reset

- Run **Prisma Studio** and click through your seeded rows.
- Learn the reset command that drops everything, re-runs all migrations and re-seeds. You will use it constantly.
- Done when: you can get from a broken database back to clean seeded data in under a minute.

## Part 6 — Build the Express application skeleton

**Goal:** a running HTTP server with security middleware, consistent error responses, request validation, and a health check — but no features yet.

### Step 6.1 — Install the web layer packages

- Runtime: **express** (version 5), **cors** (allows your frontend to call the backend), **helmet** (sets protective response headers), **cookie-parser** (reads the refresh cookie), **zod** (validates incoming data).
- Development: the matching type packages for express, cors and cookie-parser.
- Done when: they appear in the package file under the right sections.

### Step 6.2 — Assemble the application file

In **app**, add these pieces in this exact order, because order matters:

1. Helmet, for protective headers.
2. CORS, configured with your allowed origin from settings and with credentials permitted, because cookies must be allowed through.
3. The JSON body reader, with a sane size limit.
4. The cookie reader.
5. A request logger (use **pino** or **morgan**).
6. The health check route.
7. All feature routes, mounted under a single prefix such as "/api".
8. A catch-all "not found" handler.
9. The error handler, which must be last.
- Done when: the file reads like that list and nothing is out of order.

### Step 6.3 — Create the health check

- Add a route at **/api/health** that reports the service is alive, and separately whether the database and Redis respond.
- Your deployment platform will call this to decide if your instance is healthy, so keep it fast and never require authentication for it.
- Done when: calling it in your API client returns a healthy answer.

### Step 6.4 — Create the server entry file

- In **server**, import the app, create a real HTTP server from it, start listening on the configured port, and print a startup line saying which port and which environment.
- Leave a clearly marked place where the socket layer will be attached in Part 12.
- Add graceful shutdown: when the process is asked to stop, stop accepting new connections, close the socket server, disconnect Prisma and Redis, then exit.
- Done when: starting and stopping the server produces clean log lines with no warnings.

### Step 6.5 — Standardise errors

- Create your own error type that carries an HTTP status number, a short machine-readable code, and a human message.
- Create named helpers for the common cases: bad request, unauthorised, forbidden, not found, conflict, too many requests, internal error.
- In the error handler, convert anything thrown into one consistent response shape: a flag saying it failed, the code, the message, and — only outside production — the technical details.
- Log unexpected errors with full detail on the server, but never send internal details to the client.
- Done when: every failure your API can produce looks the same from the outside.

### Step 6.6 — Create the validation middleware

- Write one middleware that takes a Zod description and checks the request body, URL parameters and query string against it.
- On failure it must reject with a bad-request error listing which fields are wrong.
- On success it replaces the raw input with the cleaned, typed version, so feature code can trust what it receives.
- Done when: sending a deliberately malformed request returns a clear field-by-field complaint instead of crashing.

### Step 6.7 — Create the authentication guard (empty for now)

- Write the middleware that will read the access token from the request, verify it, and attach the current user to the request.
- Decide **once** how you will type that attached user: either extend Express's own request description, or define your own "authenticated request" type. Write your decision in the docs folder and never mix the two approaches.
- Done when: the file exists, compiles, and is ready to be filled in during Part 7.

## Part 7 — Authentication (accounts, login, tokens)

**Goal:** people can register, log in, stay logged in without re-entering a password, and log out — with tokens that are safe to use on sockets too.

### Step 7.1 — Understand the token plan before building it

- The **access token** is short-lived (about fifteen minutes), sent by the frontend on every request, and also used once when the socket connects. It is kept in the browser's memory, not in storage.
- The **refresh token** is long-lived (about thirty days), stored in a cookie the browser cannot read from script, and used only to obtain a new access token.
- **Rotation** means: every time a refresh token is used, it is invalidated and replaced. If an old one is used again, that is a signal of theft and all that user's sessions are cancelled.
- Done when: you can explain in one sentence why the access token is short-lived and the refresh token is not readable by scripts.

### Step 7.2 — Install the authentication packages

- Runtime: **bcrypt** (hashing passwords), **jsonwebtoken** (creating and verifying tokens), **uuid** (generating identifiers).
- Development: the matching type packages.
- Done when: installed.

### Step 7.3 — Decide where refresh tokens are remembered

- Pick one: a small **RefreshToken** table in Postgres (holding the token identifier, its owner, its expiry, and whether it was revoked), or a Redis key per session with an automatic expiry.
- Redis is simpler and self-cleaning; Postgres is easier to inspect. Either is fine — write your choice in the docs folder.
- If you choose the table, add it to the schema and create a migration named **add-refresh-tokens**.
- Done when: the storage exists and you can list a user's active sessions.

### Step 7.4 — Build the password and token helpers

- In **utils**, write: hash a password, compare a password against a hash, create an access token, create a refresh token, verify an access token, verify a refresh token.
- Put the user identifier and username inside the token payload. Never put the password hash or the email verification state in there.
- Done when: each helper does exactly one thing and is used everywhere instead of repeated logic.

### Step 7.5 — Build the registration endpoint

- Endpoint: **POST /api/auth/register**.
- It accepts email, username and password. Validate: email format, username between three and twenty characters using only letters, numbers, dots and underscores, and password at least eight characters.
- Check that neither the email nor the username is taken; if taken, answer with a conflict error that does not reveal which one, if you want to be strict about privacy.
- Hash the password, create the user, then return the user's public fields plus a fresh pair of tokens.
- Never return the password hash. Decide once what "public user fields" means — identifier, username, avatar, last seen — and reuse that shape everywhere.
- Done when: registering twice with the same email fails cleanly, and the stored password is unreadable in the database viewer.

### Step 7.6 — Build the login endpoint

- Endpoint: **POST /api/auth/login**.
- It accepts email (or username) and password.
- If the account does not exist, or the password does not match, return the **same** unauthorised message for both cases, so nobody can discover which emails are registered.
- On success: return the access token in the response body, and set the refresh token as a cookie that is script-inaccessible, marked secure in production, with a same-site setting that matches your deployment arrangement.
- Done when: a correct login returns a token and your API client shows the cookie was set.

### Step 7.7 — Build the refresh endpoint

- Endpoint: **POST /api/auth/refresh**.
- It reads the refresh cookie, verifies it, checks it is still valid in your store, invalidates it, issues a new pair, and sets the new cookie.
- If the token is missing, expired, or already used, answer unauthorised and clear the cookie.
- Done when: calling it repeatedly keeps working, and replaying an old cookie value fails.

### Step 7.8 — Build the logout endpoint

- Endpoint: **POST /api/auth/logout**.
- Invalidate the refresh token in your store and clear the cookie.
- Done when: after logging out, the refresh endpoint no longer works with the old cookie.

### Step 7.9 — Finish the authentication guard

- Read the access token from the authorisation header (the "Bearer" form).
- Verify it; on failure answer unauthorised with a code the frontend can recognise, such as "token expired", so it knows to try refreshing.
- Attach the current user to the request using the typing decision from Step 6.7.
- Done when: a protected route works with a valid token and fails with a clear reason without one.

### Step 7.10 — Protect the login route from guessing

- Add simple rate limiting on registration, login and refresh: for example five attempts per fifteen minutes per address, counted in Redis.
- Done when: the sixth rapid login attempt is refused with a too-many-requests answer.

### Step 7.11 — Test the whole flow by hand

- In Postman or Insomnia, create a collection named **Chat App** with a folder named **Auth**.
- Save requests for register, login, refresh, logout, and a protected call.
- Store the access token in a collection variable so later requests reuse it automatically.
- Done when: you can run the folder top to bottom and every request succeeds.

## Part 8 — Users module

**Goal:** the app can tell you who you are and let you find other people to talk to.

### Step 8.1 — Build "who am I"

- Endpoint: **GET /api/users/me**, protected by the guard.
- Return the current user's public fields.
- The frontend calls this on every page load to restore the session.
- Done when: it returns your own record with a valid token and refuses without one.

### Step 8.2 — Build user search

- Endpoint: **GET /api/users** with a query parameter named **search**.
- Match the text against username and email, case-insensitively, from the start of the word.
- Require at least two characters before searching, exclude the current user from results, and limit results to about twenty.
- Return only public fields — never email addresses of other people if you want to be careful, in which case search on username only.
- Done when: searching "al" finds alice and not everyone in the database.

### Step 8.3 — Build profile update (optional but nice)

- Endpoint: **PATCH /api/users/me**.
- Allow changing username and avatar address only. Re-check username uniqueness.
- Done when: changing your username is reflected in the conversation list.

### Step 8.4 — Shape the module consistently

Every feature folder from here on gets the same four files, with the same responsibilities:

- **routes** — lists the URLs and which middleware and handler each one uses. No logic.
- **controller** — reads the validated request, calls the service, sends the response. No database calls.
- **service** — all the real work and all database access. Knows nothing about HTTP.
- **schemas** — the Zod descriptions of the inputs and the shapes of the outputs.
- Done when: users, and then every later module, follows this pattern without exception.

## Part 9 — Conversations module

**Goal:** people can start one-to-one and group chats, and see their chat list the way a real messenger shows it.

### Step 9.1 — Build "create a conversation"

- Endpoint: **POST /api/conversations**.
- Input: a list of participant identifiers, an "is group" flag, and an optional name for groups.
- Rules to enforce: a one-to-one chat has exactly two participants and no name; a group has at least three and should have a name; the creator is always included; every listed user must actually exist.
- For one-to-one chats, first check whether a conversation between exactly those two people already exists — if it does, return the existing one instead of creating a duplicate. This is the single most commonly forgotten rule in chat apps.
- Create the conversation and its participant rows **in one transaction**, so a half-created chat can never exist. Give the creator the owner role.
- Done when: creating the same one-to-one chat twice returns the same conversation both times.

### Step 9.2 — Build "list my conversations"

- Endpoint: **GET /api/conversations**.
- For each conversation the current user belongs to, return: the identifier, whether it is a group, the display name, the display picture, the other participants' public fields, the last message (text preview, sender, time), and the unread count for the current user.
- Sort by the time of the last message, newest first. A conversation with no messages yet sorts by its creation time.
- Display name rule: for a group use its stored name; for a one-to-one use the other person's username. The backend should compute this so the frontend does not have to.
- Unread count rule: the number of messages in that conversation, not sent by the current user, that have no read receipt from the current user.
- Done when: your seeded data produces a believable chat list with correct unread numbers.

<aside>
⚠️

This endpoint is the easiest place in the whole project to accidentally write a query that runs one extra query per conversation. Fetch the conversations, then fetch their last messages and unread counts in grouped queries — not inside a loop. Check the query log once you have twenty seeded conversations.

</aside>

### Step 9.3 — Build "get one conversation"

- Endpoint: **GET /api/conversations/:id**.
- Verify the current user is a participant before returning anything. If not, answer forbidden — and answer it the same way as "not found" if you do not want to reveal that the conversation exists.
- Return the conversation with its full participant list and roles.
- Done when: asking for someone else's private conversation is refused.

### Step 9.4 — Build group management (optional in version one)

- **POST /api/conversations/:id/participants** — add people. Only owner or admin may do this.
- **DELETE /api/conversations/:id/participants/:userId** — remove someone, or leave yourself.
- **PATCH /api/conversations/:id** — rename the group or change its picture. Owner or admin only.
- Decide what happens when the owner leaves: promote the oldest admin, or refuse until ownership is transferred. Write the decision down.
- Done when: role rules are enforced and a member cannot rename the group.

### Step 9.5 — Create the reusable membership check

- Write one shared function: "is this user a participant of this conversation". It must be used by REST handlers **and** by socket handlers.
- This one function is your entire authorisation model for chats. Never inline the check.
- Done when: both the REST layer and, later, the socket layer call the same function.

## Part 10 — Message history over REST

**Goal:** you can scroll backwards through thousands of messages quickly and correctly, before any socket exists.

### Step 10.1 — Understand cursor pagination in plain words

- Page-number pagination asks "give me page four". If new messages arrive while you read, page four shifts and you see duplicates or gaps.
- Cursor pagination asks "give me the fifty messages older than this exact message". New arrivals cannot disturb it.
- The cursor is simply the identifier (and time) of the oldest message you already have.
- Done when: you can explain why chat apps never use page numbers.

### Step 10.2 — Build the history endpoint

- Endpoint: **GET /api/conversations/:id/messages** with query parameters **cursor** (optional) and **limit** (default fifty, maximum one hundred).
- Check membership first, using the shared function.
- Fetch messages for that conversation, newest first, starting after the cursor if one was given, and ask for one more row than the limit so you can tell whether more exist.
- Return: the list of messages (each with sender public fields and its receipts summary), the **nextCursor** to use for the following page, and a **hasMore** flag.
- Decide the order you return them in — newest-first from the database, and let the frontend reverse for display — and document it so the two sides never disagree.
- Done when: calling it repeatedly with the returned cursor walks backwards through all seeded messages with no repeats and no gaps.

### Step 10.3 — Handle deleted and edited messages

- A deleted message keeps its row but has a deletion time set; return it as a placeholder ("message deleted") rather than hiding it, so message ordering and receipts stay intact.
- An edited message returns its current body plus the edit time so the interface can show "edited".
- Done when: deleting a seeded message still leaves a coherent conversation.

### Step 10.4 — Add the mark-as-read endpoint

- Endpoint: **POST /api/conversations/:id/read** with a body naming the newest message the user has seen.
- Create receipts for every unread message up to and including that one, in a single bulk operation, ignoring ones that already exist.
- This REST version is your safety net; the socket version in Part 14 is the fast path.
- Done when: calling it drops that conversation's unread count to zero in the list endpoint.

### Step 10.5 — Verify performance with real volume

- Extend your seed to create about five thousand messages in one conversation.
- Time the first page and a deep page. Ask the database to explain its plan and confirm it uses the combined conversation-plus-time index rather than reading the whole table.
- Done when: both pages return quickly and the index is clearly being used.

## Part 11 — File attachments (presigned uploads)

**Goal:** users can send images and files without those bytes ever passing through your backend or your socket.

### Step 11.1 — Understand the presigned upload idea

- Your backend never receives the file. Instead, the frontend asks the backend for permission; the backend returns a temporary, single-purpose web address; the frontend uploads directly to the storage provider using that address; then the frontend tells the backend the final address of the stored file.
- Why: large files would block your server and would be catastrophic over a socket connection.
- Done when: you can describe the three-way conversation between browser, backend and storage.

### Step 11.2 — Build the signing endpoint

- Endpoint: **POST /api/uploads/sign**, protected.
- Input: the file name, the file type, and the file size.
- Validate: only allowed types (images, PDFs, plain documents) and a maximum size, for example ten megabytes. Reject everything else before signing.
- Generate a storage path that cannot collide and cannot be guessed: include the conversation identifier, the user identifier, the date, and a random identifier.
- Return the upload address, the final public address the file will have, and the expiry time of the permission.
- Done when: you can use the returned address in your API client to upload a real image, then open the returned public address in a browser.

### Step 11.3 — Connect attachments to messages

- A message may carry text, an attachment, or both — but not neither. Enforce that rule in validation.
- Store the final address on the message's attachment field. Optionally also store the type and size if you want the interface to show a file card with an icon and size.
- Done when: a message with only an image renders sensibly in the history endpoint.

### Step 11.4 — Decide the clean-up policy

- Signed-but-never-used uploads leave orphan files. Either accept it for version one and write it down, or set a storage lifecycle rule that deletes unreferenced files in a temporary prefix after a day.
- Done when: the decision is recorded in the docs folder.

## Part 12 — Realtime foundation

**Goal:** the socket server exists, shares one HTTP server with Express, only lets authenticated people connect, and both sides agree on one written list of events.

### Step 12.1 — Learn the five words you need

- **Socket** — a permanent open line between one browser tab and the server, over which either side can speak at any time.
- **Room** — a named group of sockets. Sending to a room reaches everyone in it. You will use one room per conversation, named after the conversation identifier, and one room per user, named after the user identifier, for notifications that follow the person rather than the chat.
- **Namespace** — a separate communication channel on the same connection. You will use the default one; do not invent more.
- **Acknowledgement** — a reply callback: the sender asks "did you receive this?" and the server answers on that same request. This is how the sender learns a message was truly saved.
- **Middleware** — code that runs once when a socket tries to connect, before any events are allowed. This is where authentication happens.
- Done when: you can explain each of the five without looking.

### Step 12.2 — Write the shared event contract first

- In **realtime/events**, list every event name as a constant and describe the exact shape of its payload. Nothing is typed loosely and nothing is spelled by hand at the call site.
- Client-to-server events: **conversation:join**, **conversation:leave**, **message:send**, **message:read**, **typing:start**, **typing:stop**, **sync:since**.
- Server-to-client events: **message:new**, **message:status**, **typing:update**, **presence:update**, **conversation:created**, **error**.
- Also describe the two connection-level events you will handle: connect and disconnect.
- Plan to share this one file with the frontend as well — either by importing it across the workspace or by copying it with a note that it must stay identical. Sharing it is the single biggest benefit you get from moving to TypeScript.
- Done when: the file is the only place in the project where an event name appears as text.

### Step 12.3 — Install and attach the socket server

- Install **socket.io** on the backend.
- In **realtime/index**, create the socket server from the existing HTTP server created in the server entry file.
- Configure its own CORS settings: the same allowed origin as Express, and credentials permitted. Remember this is configured **twice** — once for Express, once here — and they are separate settings.
- Set a ping interval and timeout so dead connections are noticed within a few seconds.
- Done when: your frontend-less test client (or the browser console) can open a connection and the server logs it.

### Step 12.4 — Build the socket authentication middleware

- On connection, read the access token from the connection handshake — from the authentication field, **not** from the URL query string, because query strings end up in logs.
- Verify the token with the same helper the REST guard uses.
- On failure, refuse the connection with a clear error so the client stops retrying with a bad token.
- On success, attach the user identifier and username to the socket so every later handler knows who is speaking, and never trust an identifier sent inside an event payload.
- Done when: connecting without a token fails and connecting with one succeeds and logs the username.

### Step 12.5 — Handle connect and disconnect

- On connect: add the socket to that user's personal room, record their presence (Part 15), and announce it.
- On disconnect: only mark the person offline if this was their **last** open socket — people have several tabs open.
- Update the user's last-seen time on disconnect.
- Done when: opening two tabs and closing one does not make you appear offline.

### Step 12.6 — Make every handler safe

- Wrap every socket handler in error protection. Express 5 forwards errors from routes automatically, but **socket handlers are not covered by that** — an unhandled failure inside one can take down the process.
- On failure, emit the structured error event back to that socket with a code and a message, and log the detail server-side.
- Done when: forcing an error inside a handler produces an error event on the client and the server stays alive.

### Step 12.7 — Organise the handler files

- In **realtime/handlers**, create one file per topic: **message**, **typing**, **presence**, **receipts**, **sync**.
- Each file exports a registration function that receives the socket server and the socket, and attaches its listeners. The index file calls them all in order.
- Handlers must call the same services the REST layer uses. No duplicated business logic between REST and sockets — ever.
- Done when: the socket index file is a short, readable list of registrations.

## Part 13 — Realtime messaging

**Goal:** two browser tabs exchange messages instantly, messages are saved, and retries never create duplicates.

### Step 13.1 — Build joining a conversation

- Handle **conversation:join** with a payload naming the conversation.
- Verify membership using the shared function from Step 9.5 **before** joining the room. This is the one check that stops strangers from reading private chats.
- Join the room named after the conversation and acknowledge success.
- Handle **conversation:leave** to leave the room when the user opens a different chat.
- Decide your strategy and write it down: either join only the currently open conversation, or join all of the user's conversations at login so notifications arrive everywhere. Joining all is friendlier; joining one is lighter.
- Done when: a user who is not a participant is refused with a clear error.

### Step 13.2 — Build sending a message

- Handle **message:send** with a payload of: the client-generated identifier, the conversation, an optional text body, and an optional attachment address.
- Validate the payload with the same Zod description used by REST.
- Check membership.
- Check the rate limit (Part 17).
- Save the message using the identifier the client supplied. If that identifier already exists, do **not** error and do **not** create a second row — return the existing message. That is what makes reconnection re-sends harmless.
- Acknowledge back to the sender with the saved message, including its server timestamp and status.
- Broadcast **message:new** to the conversation room.
- Done when: two tabs see each other's messages within a fraction of a second and the rows appear in the database.

### Step 13.3 — Get the broadcast audience right

- Send **message:new** to the whole conversation room, including the sender, or to everyone except the sender — choose one. Including the sender is simpler because both paths write to the cache identically; excluding them saves one message. Either works only if the client de-duplicates by message identifier.
- Also notify participants who are not currently in the room, via their personal user rooms, so their conversation list and unread badge update even while they are looking at a different chat.
- Done when: an unopened conversation's badge increases in real time.

### Step 13.4 — Add editing and deleting (optional)

- Events **message:edit** and **message:delete**, each checking that the speaker is the original sender and that the message is recent enough to edit if you want that rule.
- Broadcast the change so every open tab updates.
- Done when: editing in one tab changes the text in the other.

### Step 13.5 — Verify the hard cases by hand

- Send a message with the network disabled, then re-enable it, and confirm exactly one row was created.
- Send the identical payload twice deliberately and confirm one row.
- Send to a conversation you are not part of and confirm refusal.
- Done when: all three behave correctly.

## Part 14 — Receipts: delivered and read

**Goal:** messages show the three states people expect — sent, delivered, read — and they are accurate.

### Step 14.1 — Define the three states precisely

- **Sent** — the server has saved it. Proven by the acknowledgement.
- **Delivered** — it has reached at least one open device of each recipient. Proven by the recipient's client confirming arrival.
- **Read** — the recipient actually had it visible on screen.
- For groups, decide the display rule: show "read" only when everyone has read it, and show a count otherwise. Write it down.
- Done when: the definitions are written in the docs folder.

### Step 14.2 — Implement delivered

- When a client receives **message:new**, it immediately confirms arrival back to the server.
- The server records delivery and emits **message:status** to the sender with the message, the new status, and which user it refers to.
- Done when: the sender's single tick becomes a double tick when the other tab is open.

### Step 14.3 — Implement read

- Handle **message:read** with a payload naming the conversation and the newest message identifier the user has seen.
- Write receipts in bulk for every unread message up to that point, in one operation, ignoring existing ones.
- Emit **message:status** to the conversation room so senders update, and recalculate that user's unread count to zero.
- Done when: scrolling to the bottom in one tab turns the other tab's ticks blue.

### Step 14.4 — Decide when the client is allowed to claim "read"

- Only when the browser tab is genuinely focused **and** the message is actually within the visible area, not merely loaded.
- Group the claims: wait a moment and send one read event for the newest visible message rather than one per message.
- Done when: an unfocused background tab does not silently mark everything read.

### Step 14.5 — Keep unread counts consistent

- Unread count always derives from the receipts table — never from a counter you increment by hand, which will drift.
- If the derived query becomes slow later, cache it in Redis, but keep the database as the source of truth.
- Done when: the count from the conversation list matches what you count by eye.

## Part 15 — Presence and typing with Redis

**Goal:** online status and "typing…" work correctly even with several server instances running, because nothing is stored in the server's memory.

### Step 15.1 — Understand why memory is forbidden here

- If you keep a list of "which user is on which socket" inside your program's memory, that list only describes **one** instance. With two instances, half your users appear offline to the other half.
- Redis is a shared memory that all instances read and write, so every instance sees the same truth.
- Done when: you accept that this must be done on day one and not "later".

### Step 15.2 — Create the Redis clients

- Install **redis** and **@socket.io/redis-adapter**.
- In the **redis** folder create three clients: a **main** client for ordinary reading and writing, a **publisher**, and a **subscriber**. A client that is subscribed cannot run normal commands, which is exactly why you need separate ones.
- Handle connection errors and reconnection with logging so a Redis outage is visible rather than mysterious.
- Done when: the server logs successful Redis connections at startup.

### Step 15.3 — Design your Redis key names

Write the naming scheme down and never improvise:

- **presence:user:{userId}** — a set of that user's currently connected socket identifiers.
- **presence:online** — optionally, a set of all online user identifiers for quick lookups.
- **typing:{conversationId}:{userId}** — a short-lived marker that this person is typing, automatically expiring after about five seconds.
- **ratelimit:{userId}:{window}** — the message counter for flood protection.
- **refresh:{tokenId}** — the refresh session, if you chose Redis in Step 7.3.
- Done when: the scheme is in the docs folder with an explanation of each key's lifetime.

### Step 15.4 — Implement presence

- On connect, add the socket identifier to that user's presence set and give the key an expiry that you refresh periodically, so a crashed instance cannot leave someone online forever.
- On disconnect, remove that socket identifier; if the set becomes empty, the user is offline — update their last-seen time in Postgres and broadcast it.
- Broadcast **presence:update** with the user, whether they are online, and their last-seen time, to the personal rooms of people who share a conversation with them.
- Done when: killing the server process abruptly still results in users appearing offline within a short time.

### Step 15.5 — Implement typing indicators

- Handle **typing:start** by writing the short-lived typing key, then broadcast **typing:update** to the conversation room with the current list of typing user identifiers.
- Handle **typing:stop** by deleting the key and broadcasting again.
- Because the key expires by itself, a user who closes their laptop mid-sentence stops appearing as typing without any clean-up code.
- Never store typing state in a variable in memory, and never send one event per keystroke — the client must throttle.
- Done when: typing in one tab shows the indicator in the other and it disappears on its own after a few seconds of silence.

### Step 15.6 — Show presence in the right places

- The conversation list shows a dot per person; the chat header shows "online" or "last seen at…".
- On first load, ask the server once for the current presence of everyone in your conversation list, rather than waiting for events that may never come.
- Done when: refreshing the page shows correct presence immediately, not only after someone's status changes.

## Part 16 — Reconnection sync

**Goal:** a user who loses their connection in a lift comes back and sees exactly the messages they missed — no gaps, no duplicates.

### Step 16.1 — Understand the gap problem

- While disconnected, the client receives nothing. On reconnect it is silently out of date, and nothing in the socket layer tells it so.
- The fix: the client remembers the newest message identifier it holds for each conversation, and on reconnect asks the server for everything after it.
- Done when: you can describe the gap and the fix.

### Step 16.2 — Build the sync event

- Handle **sync:since** with a payload naming the conversation and the last message identifier the client holds.
- Check membership, look up that message's timestamp, and return every message newer than it, in order, along with any status changes to the messages it already has.
- Cap the result: if more than a few hundred messages are missing, tell the client to discard its cache and reload history from the REST endpoint instead.
- Done when: disconnecting for two minutes while another tab sends ten messages results in exactly those ten appearing on reconnect.

### Step 16.3 — Make the client reconnect properly

- Rely on the socket library's automatic reconnection with increasing delays, and cap the delay so it does not become minutes.
- On every successful reconnection, re-join the rooms and run the sync request for the open conversation.
- If reconnection fails because the token expired while offline, refresh the token first, then reconnect.
- Done when: toggling your network off and on restores a fully correct conversation without a manual page refresh.

### Step 16.4 — Handle messages the user sent while offline

- Queue unsent messages locally with their client-generated identifiers and a pending state.
- On reconnect, send them in order. Because the identifiers are stable, the server will not create duplicates even if some actually arrived before the disconnection.
- If one fails permanently, mark it failed in the interface with a retry action.
- Done when: typing three messages while offline delivers exactly three on reconnection.

## Part 17 — Rate limiting and abuse protection

**Goal:** one misbehaving client cannot flood a conversation or exhaust your server.

### Step 17.1 — Limit messages per socket

- Before saving any message, increase a counter in Redis for that user within the current time window, and set the window's expiry on first use.
- If the count exceeds your configured limit, refuse with a too-many-requests error event rather than silently dropping the message.
- Done when: sending forty messages in a few seconds gets refused after your configured limit.

### Step 17.2 — Limit the noisy events too

- Apply a lighter limit to typing events, join requests and sync requests.
- Done when: a script spamming typing events is throttled.

### Step 17.3 — Add input size limits

- Cap message body length, for example two thousand characters, in the shared Zod description so both REST and socket paths enforce it.
- Cap attachment size at the signing endpoint.
- Done when: an oversized message is rejected with a clear field error.

### Step 17.4 — Add the HTTP limits

- Limit the authentication endpoints (already done in Step 7.10) and add a general limit to the rest of the API.
- Done when: your API client sees the limit headers or a refusal after enough rapid calls.

## Part 18 — Horizontal scaling: two instances behind one entry point

**Goal:** the portfolio centrepiece — two separate server processes, one load balancer, and messages still arriving everywhere.

### Step 18.1 — Understand why a plain setup breaks

- Each instance only knows about the sockets connected to itself. If Alice is on instance one and Bob is on instance two, Alice's message never reaches Bob.
- The Redis adapter fixes this: when an instance broadcasts to a room, it publishes that broadcast through Redis and every other instance re-delivers it to its own sockets.
- Done when: you can explain it in two sentences.

### Step 18.2 — Wire the Redis adapter

- Attach the adapter to the socket server using the publisher and subscriber clients from Step 15.2.
- Do it unconditionally, in development too, so you never discover a broken assumption only in production.
- Done when: the server starts with the adapter active and logs it.

### Step 18.3 — Run two instances locally

- Start the same backend twice on two different ports, both pointing at the **same** Postgres and the **same** Redis.
- Put a simple load balancer in front: add an **nginx** service to your Compose file that distributes connections between the two, or run two Compose replicas behind it.
- Done when: both instances log startup and the balancer answers your health check.

### Step 18.4 — Deal with sticky sessions

- Socket.IO can fall back to long HTTP polling. Polling sends several separate requests that **must** reach the same instance, otherwise the handshake breaks with mysterious errors.
- Choose one: configure the load balancer to send the same client to the same instance (sticky sessions based on the client address or a cookie), or force the client to use only the websocket transport and skip polling entirely.
- Write your choice down. This is the classic bug that only appears in production.
- Done when: connections are stable with no repeated handshake errors in the logs.

### Step 18.5 — Prove it and record it

- Open two browsers. Confirm from the logs that they landed on different instances — log the instance name on connect to make this visible.
- Exchange messages, typing indicators and presence between them.
- Kill one instance mid-conversation and confirm the affected client reconnects to the survivor and syncs.
- Record a short screen video showing the two instance logs side by side while messages flow across them.
- Done when: the video exists. It goes in the README.

<aside>
🏆

This part is the difference between "another tutorial chat app" and "this person understands distributed systems". Almost no junior project can demonstrate it. Do not skip it, and do not fail to record it.

</aside>

## Part 19 — Frontend project setup

**Goal:** a typed React project that builds, formats, talks to your backend, and has its folders decided before you write screens.

### Step 19.1 — Create the project

- Inside the **client** folder, create a Vite project using the React with TypeScript template.
- Install the runtime packages: **socket.io-client** (the socket connection), **@tanstack/react-query** (server data cache), **axios** (HTTP calls), **react-router-dom** (page routing), **zustand** (small live state store).
- Install the development packages: **tailwindcss** with its Vite plugin, plus ESLint and Prettier matching the backend setup.
- Done when: the starter page loads in the browser.

### Step 19.2 — Configure styling

- Set up Tailwind and import it in your main stylesheet.
- Define your design tokens once: brand colours, the bubble colours for your own messages and other people's, spacing and the rounded-corner size.
- Done when: a test element styled with your brand colour renders correctly.

### Step 19.3 — Configure the frontend settings

- Create **client/.env** with **VITE_API_URL** (your backend address) and **VITE_SOCKET_URL** (usually the same).
- Create **client/.env.example** alongside it.
- Read them in one settings file and never scatter addresses through components.
- Done when: changing the port in one place moves the whole app.

### Step 19.4 — Decide the folder layout

Inside **client/src**, create:

- **api/** — the axios instance and one file per feature describing the calls: auth, users, conversations, messages, uploads.
- **hooks/** — reusable React hooks, including the query hooks and the socket hooks.
- **store/** — the Zustand stores: authentication, socket connection status, typing, presence, unsent queue.
- **components/** — dumb, reusable pieces: avatar, button, input, spinner, modal, message bubble, typing dots.
- **features/** — grouped screens and their parts: **auth/**, **conversations/**, **chat/**.
- **pages/** — the routed screens: login, register, chat, not-found.
- **types/** — the shared domain types, including the copy of the socket event contract from Step 12.2.
- **lib/** — small helpers: date formatting, identifier generation, grouping messages by day.
- Done when: the tree exists and compiles.

### Step 19.5 — Create the HTTP client

- Configure axios once with your API address and with credentials enabled, so the refresh cookie is sent.
- Add an outgoing interceptor that attaches the access token to every request.
- Add an incoming interceptor that, on an "unauthorised because expired" answer, calls the refresh endpoint once, then retries the original request. Make sure several simultaneous failures trigger only **one** refresh, and that a failed refresh logs the user out.
- Done when: leaving the tab open past the access token's lifetime and then clicking something still works silently.

### Step 19.6 — Set up React Query

- Wrap the app in the query provider.
- Set sensible defaults: do not refetch on every window focus for message history, retry once, and keep data considered fresh for a short time.
- Decide your query key naming scheme now and write it down, for example: the conversations list, one conversation, and the messages of a conversation.
- Done when: the developer tools panel shows your queries by name.

## Part 20 — Frontend authentication flow

**Goal:** a person can register, log in, stay logged in after a refresh, and be sent to the login screen when they are not allowed in.

### Step 20.1 — Create the authentication store

- Hold: the current user, the access token in memory only, and a "still checking" flag.
- Never store the access token in browser storage. If the page is refreshed, the token is gone — that is intentional, and the refresh cookie restores the session.
- Done when: the store exists with actions for setting the session and clearing it.

### Step 20.2 — Build the session restore step

- On application start, try the refresh endpoint; if it succeeds, fetch "who am I" and fill the store; if it fails, mark the user as a guest.
- Show a loading screen while this is happening, so protected routes do not flash the login page for a moment.
- Done when: refreshing the browser keeps you logged in without a visible flicker.

### Step 20.3 — Build the login and register screens

- Login screen: email (or username) and password, a submit button with a busy state, and one error area showing the server's message.
- Register screen: email, username, password and password confirmation, with the same validation rules as the backend, checked before sending.
- Link the two screens to each other.
- Done when: both screens work against your real backend and show sensible errors for wrong credentials.

### Step 20.4 — Build route protection

- Create a wrapper for private routes: if there is no user, redirect to login and remember where they were trying to go.
- Create a wrapper for public-only routes: if there **is** a user, send them to the chat.
- Done when: typing the chat address while logged out lands you on login and, after logging in, on the chat.

### Step 20.5 — Build logout

- Call the logout endpoint, clear the store, clear the whole query cache, and disconnect the socket. Forgetting any one of these leaks the previous user's data into the next session.
- Done when: logging out and logging in as someone else shows no trace of the first account.

## Part 21 — Frontend layout, routing and conversation list

**Goal:** the familiar two-panel messenger shell, with a working, live-sorted chat list.

### Step 21.1 — Build the shell

- Left panel: the conversation list with a search box at the top and the current user's details at the bottom.
- Right panel: the chat area, or an empty state saying "choose a conversation".
- On narrow screens, show only one panel at a time and switch between them.
- Done when: the layout holds its shape at desktop and phone widths without inner scrollbars in the wrong places.

### Step 21.2 — Define the routes

- **/login**, **/register**, **/** (the chat shell with an empty state), **/c/:conversationId** (the shell with that conversation open), and a not-found route.
- Using the conversation identifier in the address means a chat can be linked and survives a refresh.
- Done when: pasting a conversation address opens that chat directly.

### Step 21.3 — Build the conversation list item

Each row shows: the picture (the other person's avatar, or a group symbol), the display name, the last message preview with a prefix saying who sent it, the relative time, the unread badge, the online dot, and a typing indicator that temporarily replaces the preview.

- Truncate the preview to one line and show "photo" or "file" instead of an empty preview for attachment-only messages.
- Highlight the currently open conversation.
- Done when: your seeded data looks like a real messenger list.

### Step 21.4 — Build "start a new chat"

- A button opens a dialog with a person search box using the user search endpoint, debounced so it does not call on every keystroke.
- Selecting one person creates or finds a one-to-one conversation and opens it.
- Selecting several people reveals a group name field and creates a group.
- Done when: you can start a chat with a seeded user and immediately send a message.

### Step 21.5 — Keep the list live

- When a new message arrives for any conversation, update that row's preview, time, unread badge and position in the list without refetching the whole list.
- When you open a conversation, clear its badge locally at once, then confirm with the server.
- Done when: a message sent from another browser reorders your list instantly.

## Part 22 — Frontend chat window and history

**Goal:** the message area behaves like a real chat: scrolled to the bottom, loading older messages upwards, grouped sensibly, never jumping.

### Step 22.1 — Build the header

- Show the name, the picture, and the status line: "online", "typing…", or "last seen" with a friendly time.
- For groups, show the member count and, on tap, the member list.
- On narrow screens, include a back arrow to the list.
- Done when: the header reflects presence changes live.

### Step 22.2 — Load the history

- Use the infinite-query pattern against the history endpoint, using the cursor the server returns.
- Reverse the order for display so the newest message is at the bottom.
- Show a skeleton while the first page loads and an empty state for a brand-new conversation.
- Done when: opening a seeded conversation shows the newest fifty messages at the bottom.

### Step 22.3 — Get the scrolling right

This is the fiddliest part of the whole frontend. Handle these four cases explicitly:

- **First load:** jump to the bottom without an animation.
- **New message arrives while you are at the bottom:** scroll smoothly to it.
- **New message arrives while you have scrolled up:** do **not** move the view; show a "new messages" pill that scrolls down when clicked.
- **Loading older messages:** measure the scroll height before inserting, then restore the position afterwards, so the content does not jump under the reader's eyes.
- Done when: all four behave correctly, including after loading three pages of history.

### Step 22.4 — Build the message bubble

- Own messages align right with your brand colour; others align left in a neutral colour.
- Show the time inside the bubble, the status ticks for your own messages only, and "edited" when relevant.
- In groups, show the sender's name and avatar on the first message of a run only.
- Group consecutive messages from the same person within a few minutes into a tighter run.
- Insert a date divider whenever the day changes, saying "Today", "Yesterday" or the date.
- Render attachments as an image thumbnail that opens larger, or as a file card with name, size and a download action.
- Done when: a long seeded conversation reads clearly and nothing looks cramped.

### Step 22.5 — Build the composer

- A text area that grows to a few lines and then scrolls, sending on Enter and adding a newline on Shift-and-Enter.
- A send button that is disabled when the text is empty and no attachment is chosen.
- An attachment button, an upload progress indicator, and a preview with a remove option.
- Keep a per-conversation draft so switching chats does not lose typing.
- Disable the composer with an explanation when the socket is disconnected, or allow queueing — if you allow queueing, say so in the interface.
- Done when: sending works with text, with an image, and with both.

## Part 23 — Frontend realtime layer and state ownership

**Goal:** the socket and the cache never fight each other, so messages never duplicate or arrive out of order.

<aside>
🧯

The hardest part of a realtime application is not the socket — it is **two systems writing the same data**. React Query caches server data; the socket pushes server data. If both write carelessly you get duplicated and out-of-order messages. The rules below are not suggestions; they are the design.

</aside>

### Step 23.1 — Write the ownership rules on the wall

- **React Query owns history.** All loaded messages live in its cache, keyed by conversation.
- **The socket owns the live tail.** An incoming message is written **into the React Query cache**, never into a separate list held in component state.
- **Zustand owns only what the server does not store:** connection status, which users are typing, the presence map, and the queue of unsent messages.
- **Every cache write de-duplicates by message identifier.** This one rule is what makes optimistic sending safe.
- Done when: these four sentences are in a comment at the top of your socket hook and in your README.

### Step 23.2 — Build the socket connection manager

- Create one single socket instance for the whole application — never one per component.
- Connect only after the user is authenticated, passing the access token in the connection's authentication field.
- Handle the lifecycle events: connected, disconnected with its reason, reconnection attempt, reconnected, and connection error.
- Store the connection status in Zustand so any part of the interface can show a "reconnecting…" banner.
- Disconnect on logout and on the application unmounting.
- Done when: the banner appears when you disable your network and disappears when you restore it.

### Step 23.3 — Build the event listener hook

- Register every server-to-client listener in exactly one place, using the shared event names — never a hand-typed string.
- Remove the listeners when it unmounts, so hot reloading does not accumulate duplicates. Duplicated listeners are the number one cause of "each message appears three times".
- Route each event to its handler: a new message updates the message cache and the conversation list; a status change updates that message's ticks; typing and presence write to Zustand; a created conversation adds a row to the list.
- Done when: the same message never renders twice, even after ten saves in a row with hot reloading.

### Step 23.4 — Build the optimistic send

Follow this order exactly:

1. Generate a unique identifier on the client.
2. Insert the message into the cache immediately with a pending state, so it appears instantly.
3. Emit the send event with that identifier and wait for the acknowledgement.
4. On acknowledgement, replace the pending copy **in place** with the server's version, keeping its position so the view does not jump.
5. On timeout or error, mark it failed and show a retry action that re-sends the **same** identifier.
- Because the identifier is unchanged, a retry can never create a second message.
- Done when: sending on a slow connection shows the message immediately, then confirms it, and a forced failure offers a retry that works.

### Step 23.5 — Handle joining and leaving rooms

- When a conversation is opened, emit the join event and wait for its acknowledgement before trusting that live messages will arrive.
- When leaving, emit the leave event, unless you chose to join all conversations at login.
- On reconnection, re-join automatically.
- Done when: switching between two conversations repeatedly never leaves you in a stale room.

### Step 23.6 — Handle ordering

- Sort by the server timestamp, and break ties with the identifier so the order is stable.
- Never trust the arrival order of events; two messages sent in the same instant can arrive either way round.
- Done when: rapid-fire messages from two tabs appear in the same order in both.

## Part 24 — Frontend polish

**Goal:** the details that make it feel finished rather than assembled.

### Step 24.1 — Typing indicators

- Emit typing-start when the user begins typing, throttled to at most once every couple of seconds — never per keystroke.
- Emit typing-stop after a short pause, on sending, and when leaving the conversation.
- Show "Alice is typing…" for one person, "Alice and Bob are typing…" for two, and "several people are typing…" beyond that.
- Done when: the indicator appears and clears correctly in both directions.

### Step 24.2 — Read receipts on screen

- Watch which messages are actually visible using an intersection observer, and only claim "read" when the tab is focused.
- Batch the claims and send the newest visible identifier.
- Show one tick for sent, two for delivered, two coloured for read, a clock for pending, and a warning symbol with retry for failed.
- Done when: the ticks change in the other tab as you scroll.

### Step 24.3 — Presence on screen

- Show the online dot in the list and the header, and a friendly last-seen line otherwise: "last seen just now", "last seen 10 minutes ago", "last seen yesterday at 21:14".
- Done when: closing the other browser flips the dot within a few seconds.

### Step 24.4 — Notifications

- Show the total unread count in the browser tab title.
- Optionally play a short sound and show a browser notification when a message arrives while the tab is not focused, with a setting to turn it off.
- Done when: a background tab's title shows the count and clears when you return.

### Step 24.5 — Error, empty and loading states

Decide and build one of each, so nothing ever shows a blank rectangle:

- Loading: the conversation list, the message history, the older-messages page, sending.
- Empty: no conversations yet, no messages yet, no search results.
- Error: request failed with a retry action, socket disconnected banner, upload failed, session expired.
- Done when: you can force every state deliberately and each one looks intentional.

### Step 24.6 — Accessibility and keyboard

- Every interactive element is reachable by keyboard and has a visible focus outline.
- The message list announces new messages to screen readers politely.
- Images have descriptions; icon-only buttons have labels.
- Check colour contrast on your bubble colours.
- Done when: you can send a message using only the keyboard.

### Step 24.7 — Responsiveness and final look

- Test at phone, tablet and desktop widths.
- Check very long words, very long messages, messages that are only emoji, and right-to-left text if relevant.
- Done when: nothing overflows its container at any width.

## Part 25 — Testing

**Goal:** the risky parts are proven by tests, not by hope.

### Step 25.1 — Set up the tools

- Install **Vitest** on both the backend and the frontend.
- Add a **test** command and a coverage command to both package files.
- Create a separate test database, either a second Postgres database name or a throwaway container, and a separate Redis database number. Tests must never touch your development data.
- Done when: an empty test run passes on both sides.

### Step 25.2 — Write the unit tests that matter

- Token creation and verification, including an expired token.
- Password hashing and comparison.
- The Zod descriptions: valid input passes, each invalid case fails with the right complaint.
- The cursor pagination helper: the first page, a middle page, the last page, and an empty conversation.
- The unread count calculation.
- Done when: these pass and fail for the right reasons when you deliberately break the code.

### Step 25.3 — Write the integration tests

Against the real test database, cover:

- Register, then log in, then call a protected route.
- Refresh rotation, including re-using an old refresh token, which must fail.
- Creating a one-to-one conversation twice returns the same one.
- A non-participant is refused access to a conversation and to its history.
- Paging through history returns every message exactly once.
- Sending the same message identifier twice creates one row.
- Done when: the suite runs from a clean database every time.

### Step 25.4 — Write the socket tests

- Connecting without a token is refused; with a valid one it succeeds.
- Joining a conversation you do not belong to is refused.
- A message sent by one test client is received by a second test client in the same room and not by a third client elsewhere.
- A re-sent identifier does not duplicate.
- Done when: these run without leaving connections open, so the test process exits cleanly.

### Step 25.5 — Optional end-to-end test

- With **Playwright**, script two browser contexts: both log in, one sends, the other receives, the ticks change, typing appears.
- This is also the easiest way to produce your demonstration video.
- Done when: the script passes twice in a row.

### Step 25.6 — Add continuous checks

- Create a GitHub Actions workflow that, on every push, installs dependencies, runs typecheck, lint, and tests with Postgres and Redis service containers.
- Done when: the badge on your repository is green.

## Part 26 — Deployment

**Goal:** it runs on the internet, with a real database, and keeps its socket connections alive.

### Step 26.1 — Prepare the backend for production

- Write a **Dockerfile** for the server using a build stage and a slim run stage, running as a non-root user.
- Make sure migrations are applied on release, not on every process start, so two instances cannot run them at the same time.
- Confirm the health check endpoint is what the platform will poll.
- Set trust-proxy behaviour so client addresses and secure cookies work behind the platform's load balancer.
- Done when: building and running the image locally works using only environment variables.

### Step 26.2 — Provision the services

- Create a managed Postgres database and a managed Redis instance on your chosen platform.
- Copy their connection strings into the platform's secret settings, together with every other key from Step 4.1. Generate **new** token secrets for production — never reuse your local ones.
- Done when: the settings list in the platform matches your example environment file exactly.

### Step 26.3 — Deploy the backend

- Deploy, watch the logs, and confirm: settings validated, migrations applied, database connected, Redis connected, adapter active, listening.
- Then scale to two instances and confirm the adapter is doing its job in production too.
- Done when: the public health check answers healthy and two instances are running.

### Step 26.4 — Deploy the frontend

- Build the client and host it as static files, on **Vercel**, **Netlify**, or on the same platform.
- Point its two settings at the public backend address.
- Update the backend's allowed origin setting to the frontend's real address, and redeploy the backend.
- Done when: the deployed frontend logs in against the deployed backend.

### Step 26.5 — Fix the cross-origin cookie details

- The socket client must be told to send credentials.
- The refresh cookie must be marked secure, and its same-site setting must be the one that permits cross-site sending if your frontend and backend are on different domains.
- If this becomes painful, put both behind one domain with a path prefix for the API — that removes the whole class of problem.
- Done when: logging in, refreshing the page, and reconnecting all work on the deployed version, in a private browsing window too.

### Step 26.6 — Add the production basics

- Structured logging with a request identifier so one user's journey can be followed.
- Error reporting, for example **Sentry**, on both sides.
- An uptime check hitting your health endpoint.
- A database backup schedule, and one restore rehearsal so you know it works.
- Done when: you deliberately cause an error and see it appear in your error reporting tool.

### Step 26.7 — Final live testing

- Test from two different devices on different networks, including a phone.
- Test with a genuinely poor connection using your browser's network throttling.
- Test what happens when you lock the phone, wait, and return.
- Done when: every case recovers without a manual refresh.

## Part 27 — README and portfolio packaging

**Goal:** a stranger understands in two minutes what you built and why it is not a tutorial project.

### Step 27.1 — Write the README

Include, in this order: one sentence describing the project; a screenshot or short animation; the live address and the demonstration login details; the feature list; the stack with a one-line reason for each choice; the architecture diagram; the data model diagram; local setup instructions someone else can follow; the environment variable table; the available commands; the testing instructions; and a short "what I learned and what I would do differently" section.

- Done when: a friend can run it locally using only the README.

### Step 27.2 — Draw the two diagrams

- **Architecture diagram:** browsers, load balancer, two backend instances, Postgres, Redis, and the file storage, with arrows labelled "HTTP" and "WebSocket" and a note showing the adapter path through Redis.
- **Data model diagram:** the five tables with their relationships and the two important indexes marked.
- Keep both in the **docs** folder and show them in the README.
- Done when: both diagrams are readable at a glance.

### Step 27.3 — Record the demonstrations

- A short video of a normal conversation: sending, typing, receipts, presence.
- A short video of the reconnection behaviour: network off, messages queued, network on, everything syncs.
- The scaling video from Step 18.5, with both instance logs visible.
- Done when: all three are linked in the README.

### Step 27.4 — Write down the trade-offs

- List what you deliberately did not build and why: NestJS, Next.js, video calling, end-to-end encryption, push notifications, message search, Kafka, GraphQL, Kubernetes.
- List the known limitations honestly.
- Interviewers respect a documented decision far more than a long feature list.
- Done when: the section exists and reads confidently rather than apologetically.

## Part 28 — Glossary of every term used above

- **Access token** — a short-lived signed pass proving who you are on each request.
- **Acknowledgement** — a reply callback on a socket event confirming the server handled it.
- **Adapter (Redis)** — the piece that lets several server instances share socket broadcasts.
- **Cursor pagination** — fetching "the items before this exact item" instead of "page number four".
- **Debounce** — wait until activity stops before acting.
- **Throttle** — act at most once per time period no matter how often it is triggered.
- **Environment variable** — a setting supplied from outside the code, never committed.
- **Health check** — a tiny endpoint the platform polls to decide whether your instance is alive.
- **Idempotent** — doing the same operation twice has the same result as doing it once.
- **Index (database)** — a lookup structure that makes certain queries fast.
- **Interceptor** — code that runs automatically before a request is sent or after a response arrives.
- **JWT** — a token format whose contents can be read by anyone but whose signature only your secret can create.
- **Load balancer** — the entry point that spreads incoming connections across instances.
- **Migration** — a recorded, repeatable change to the database structure.
- **Middleware** — code that runs between the arrival of a request or connection and its handler.
- **Optimistic update** — showing the result immediately and correcting it if the server disagrees.
- **ORM** — the library that lets you work with tables as typed objects; here, Prisma.
- **Presigned URL** — a temporary permission slip to upload one file directly to storage.
- **Publish and subscribe** — one party announces on a channel and every listener receives it; how Redis links your instances.
- **Refresh token** — a long-lived credential in a script-inaccessible cookie, used only to obtain new access tokens.
- **Room** — a named group of sockets you can broadcast to.
- **Seed** — a script that fills an empty database with believable test data.
- **Socket** — a permanently open two-way connection between browser and server.
- **Sticky session** — a load balancer rule sending the same client back to the same instance every time.
- **Time to live** — an automatic expiry on a stored value; how typing and presence clean themselves up.
- **Transaction** — several database writes that all succeed or all fail together.
- **Transport** — the underlying mechanism a socket uses: websocket, or HTTP long-polling as a fallback.

## Part 29 — The order of work, mapped to your six weeks

| Week | Parts to complete | You should be able to say |
| --- | --- | --- |
| 1 | Parts 0–2 | "My machine is ready and my backend is a strict TypeScript project." |
| 2 | Parts 3–6 | "Postgres and Redis run locally, my five tables exist with seeded data, and my Express skeleton answers a health check." |
| 3 | Parts 7–11 | "The whole API works in Postman: accounts, conversations, paged history, uploads — with no sockets at all." |
| 4 | Parts 12–14 | "Two browser tabs chat instantly, messages are saved, and ticks change to delivered and read." |
| 5 | Parts 15–18 | "Presence and typing live in Redis, reconnection fills the gap, flooding is blocked, and two instances work behind one balancer." |
| 6 | Parts 19–24 | "There is a real interface: login, chat list, message window, optimistic sending, receipts, typing, presence." |
| 7 (buffer) | Parts 25–27 | "It is tested, deployed, documented and recorded." |

<aside>
🚦

**Two rules that decide whether this project finishes.** First: every part must end in a state you could demonstrate — if a part is half done, finish it before starting the next one. Second: the moment you feel the urge to add something not in this plan, write it on the deferred list instead of into your dependency file. The deferred list is where good ideas wait; your dependency file is where projects die.

</aside>