// ============================================================
// 📁 FILE: app.ts
// 🎯 PURPOSE: This file is the HEART of our backend server.
//    It creates and configures the Express application.
//    Think of it like building a house — this file sets up
//    all the rooms, locks, doors, and security cameras
//    BEFORE anyone is allowed inside.
//
// 🧠 ADHD TIP: Every time you open this file, remember:
//    "This file sets up HOW the server behaves, not what it does."
//    Routes/features live in other files. This is the foundation.
// ============================================================


// ─────────────────────────────────────────────────────────────
// 📦 IMPORTS — Loading the tools we need before we start cooking
// ─────────────────────────────────────────────────────────────
import { env } from "./config/env.js";
// ✅ EXPRESS — The main web framework. Like the skeleton of our server.
//    It handles incoming HTTP requests (GET, POST, etc.) and sends responses.
//    ADHD Example: Think of Express like a restaurant host — it receives
//    customers (requests), directs them to the right table (route), and
//    sends back food (response).
import express, {
  type Application,    // 🏠 The type for the whole Express app instance
  type Request,        // 📩 The type for an incoming HTTP request (what the client sends)
  type Response,       // 📤 The type for the HTTP response (what we send back)
  type NextFunction,   // ➡️ A function to pass control to the next middleware
} from "express";

// ✅ HELMET — Adds security headers to every response automatically.
//    It's like putting a helmet on your server before it goes outside.
//    It protects against common web attacks like XSS, clickjacking, etc.
//    ADHD Example: You don't have to think about security headers one by one.
//    Helmet handles it all in ONE line — set it and forget it! 🪖
import helmet from "helmet";

// ✅ CORS — Cross-Origin Resource Sharing.
//    Controls WHICH websites/apps are allowed to talk to our backend.
//    Without this, browsers would BLOCK requests from your React frontend.
//    ADHD Example: It's like a bouncer at a club — only people on the
//    guest list (allowed origins) can get in. 🚫🚪
import cors from "cors";

// ✅ COOKIE-PARSER — Reads and parses cookies from incoming requests.
//    Cookies are small pieces of data stored in the user's browser
//    (like a session token or auth info).
//    ADHD Example: Imagine every visitor has a sticky note on their hand
//    (cookie). Cookie-parser reads that sticky note so we know who they are.
import cookieParser from "cookie-parser";

// ✅ PINO-HTTP — A fast, structured HTTP request logger.
//    Every time a request comes in, it logs useful info (method, URL, status, time).
//    ADHD Example: It's like a camera recording every door opening in the house.
//    Great for debugging — "Wait, why is this route being hit?!" 🎥
import { pinoHttp } from "pino-http";

// ✅ PRISMA — Our database client.
//    We import it here to check if the database is alive in the health route.
//    ADHD Example: Prisma is our translator between JavaScript and the database.
//    We just write JS, and Prisma converts it into SQL for us. 🗄️
import { prisma } from "./db/prisma.js";
import authRouter from "./modules/auth/auth.routes.js";
import usersRouter from "./modules/users/users.routes.js";
import uploadsRouter from "./modules/uploads/uploads.routes.js";
import messagesRouter from "./modules/messages/messages.routes.js";
import conversationsRouter from "./modules/conversations/conversations.routes.js";
import rateLimit from "express-rate-limit";

// ─────────────────────────────────────────────────────────────
// 🧩 INTERFACE: HttpError
// ─────────────────────────────────────────────────────────────

// 🔧 WHY: TypeScript doesn't know that errors can have a "status" number
//    (like 404 or 500). We EXTEND the built-in Error type to add that field.
//    This way our global error handler (below) can read err.status safely.
//
// ADHD Example: It's like adding a "severity level" label to error notes
//    so we know whether it's a small oops (400) or a big crash (500). 🚨
interface HttpError extends Error {
  status?: number; // Optional HTTP status code (e.g. 404, 401, 500)
}


// ─────────────────────────────────────────────────────────────
// 🏗️ FACTORY FUNCTION: createApp()
// ─────────────────────────────────────────────────────────────

// 🔧 WHY a FUNCTION instead of just `const app = express()`?
//    Using a function makes the app TESTABLE. In tests, you can call
//    createApp() to get a fresh instance without starting the real server.
//    ADHD Example: Instead of having ONE restaurant that's always open,
//    you can create a COPY of the restaurant just for practice/testing. 🍽️
export function createApp(): Application {

  // 🚀 Create the Express app — this is our actual server instance
  const app = express();
  if (env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  // ───────────────────────────────────────────────────────────
  // 🛡️ MIDDLEWARE SETUP
  // "Middleware" = functions that run on EVERY request, in order,
  //  before it reaches your actual route handlers.
  //
  // ADHD Visual:
  //   Request → [Logger] → [CORS] → [Helmet] → [JSON Parser] → [Cookie Parser]
  //           → [Your Route] → [Response]
  // Each middleware does its job and passes to the next one. ➡️
  // ───────────────────────────────────────────────────────────


  // ✅ LOGGER MIDDLEWARE (pino-http) — MUST BE FIRST
  // Logs every HTTP request with useful metadata.
  // Placed HERE (before all other middleware) so every request is captured,
  // including those that fail CORS or are rejected early.
  //   - `redact`: Hides auth headers and cookies from logs (never log secrets). 🔒
  //   - `transport`: Pretty-print in dev; raw JSON in production (for log aggregators).
  app.use(
    pinoHttp({
      // 🚫 Never log authorization headers or cookies — these are sensitive secrets!
      redact: ["req.headers.authorization", "req.headers.cookie"],

      // 🎨 Pretty print in dev for readability; raw JSON in production for performance
      transport:
        process.env.NODE_ENV === "production"
          ? undefined               // In production: fast JSON output (for tools like Datadog, Loki)
          : { target: "pino-pretty" }, // In development: colorful, formatted logs in terminal
    })
  );


  // ✅ CORS MIDDLEWARE
  // Allow requests ONLY from our React frontend running at localhost:5173.
  // `credentials: true` allows cookies to be sent along with requests.
  // ADHD Note: If you change the frontend port, UPDATE the origin here too!
  //            Otherwise the browser will silently block all requests. 😤
  app.use(cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }));


  // ✅ JSON BODY PARSER (with size limit)
  // Tells Express to automatically parse incoming JSON request bodies.
  // The `limit: "100kb"` prevents people from sending huge payloads
  // that could slow down or crash the server (a basic DoS protection).
  // ADHD Example: This is like saying "we accept packages, but only
  //    up to 100kb in weight — no giant boxes allowed." 📦
  app.use(express.json({ limit: "100kb" }));


  // ✅ COOKIE PARSER MIDDLEWARE
  // Parses cookies from the request headers into `req.cookies`.
  // Without this, `req.cookies` would just be undefined.
  // ADHD Note: Used for reading auth tokens stored in cookies (HttpOnly cookies
  //            are more secure than localStorage for storing JWTs). 🍪
  app.use(cookieParser());


  // ✅ HELMET MIDDLEWARE
  // Automatically sets a bunch of HTTP security headers.
  // Things like Content-Security-Policy, X-Frame-Options, etc.
  // ADHD Reminder: Always place helmet BEFORE your routes so ALL
  //                responses get the security headers. 🪖
  app.use(helmet());

  // ── General API rate limit ────────────────────────────────────────────────
  // 100 requests per minute per IP. This applies to ALL /api/* routes.
  // Auth routes have their own stricter limits on top of this.
  const generalApiLimiter = rateLimit({
    windowMs:         60 * 1000,        // 1 minute window
    max:              100,              // max 100 requests per window per IP
    standardHeaders:  true,             // sends RateLimit-* headers in the response
    legacyHeaders:    false,            // turns off the older X-RateLimit-* headers
    message: {
      ok:      false,
      code:    "TOO_MANY_REQUESTS",
      message: "Too many requests. Please slow down and try again in a minute.",
    },
  });

  // Apply the general limiter to all /api routes.
  app.use("/api", generalApiLimiter);


  // ⚠️ REMOVED: duplicate express.json() that overrode the 100kb limit above.

  // ─────────────────────────────────────────────────────────
  // 🔐 AUTH ROUTES — /api/auth
  // ─────────────────────────────────────────────────────────
  // POST /api/auth/register — create account, return tokens
  app.use("/api/auth", authRouter);

  // ─────────────────────────────────────────────────────────
  // 👤 USER ROUTES — /api/users
  // ─────────────────────────────────────────────────────────
  // GET   /api/users/me       → who am I?        (Step 8.1)
  // GET   /api/users?search=  → search users     (Step 8.2)
  // PATCH /api/users/me       → edit my profile  (Step 8.3)
  // All routes protected by the authenticate middleware (applied in the router).
  app.use("/api/users", usersRouter);

  // ─────────────────────────────────────────────────────────
  // 📂 UPLOADS ROUTES — /api/uploads
  // ─────────────────────────────────────────────────────────
  // POST /api/uploads/sign → generate a signed URL for uploading an attachment to S3.
  app.use("/api/uploads", uploadsRouter);

  // ─────────────────────────────────────────────────────────
  // 📂 MESSAGES ROUTES — mounted at /api/conversations
  // ─────────────────────────────────────────────────────────
  // The messages router defines conversation-scoped routes:
  //   GET    /api/conversations/:id/messages
  //   POST   /api/conversations/:id/messages
  //   POST   /api/conversations/:id/read
  //   DELETE /api/conversations/messages/:messageId
  //   PATCH  /api/conversations/messages/:messageId
  // All routes protected by the authenticate middleware (applied in the router).
  app.use("/api/conversations", messagesRouter);

  // ─────────────────────────────────────────────────────────
  // 📂 CONVERSATIONS ROUTES — /api/conversations
  // ─────────────────────────────────────────────────────────
  // GET   /api/conversations         → list conversations     (Step 10.1)
  // POST  /api/conversations         → create conversation    (Step 10.2)
  // PATCH /api/conversations/:conversationId → edit conversation    (Step 10.3)
  // All routes protected by the authenticate middleware (applied in the router).
  app.use("/api/conversations", conversationsRouter);

  // ─────────────────────────────────────────────────────────
  // 🏠 ROOT ROUTE — GET /
  // ─────────────────────────────────────────────────────────
  // A friendly landing page so opening localhost:4000 in the
  // browser doesn't return a confusing 404.
  app.get("/", (_req, res) => {
    res.status(200).json({
      ok: true,
      message: "ChatApp API is running 🚀",
      version: "1.0.0",
      docs: "/api/health",
    });
  });

  // ─────────────────────────────────────────────────────────
  // 🩺 HEALTH CHECK ROUTE — GET /api/health
  // ─────────────────────────────────────────────────────────
  // 🔧 WHY: Health checks tell you (or a monitoring tool) whether the
  //    server and its dependencies (like the database) are alive and working.
  //
  // ADHD Example: It's like asking "Are you okay?" and getting a quick
  //    "Yes ✅" or "No ❌" response. Useful for uptime monitors, Docker
  //    health checks, and debugging deployment issues.
  //
  // Returns:
  //   - 200 OK  → everything is working
  //   - 503 Service Unavailable → database is down
  app.get("/api/health", async (_req, res) => {
    // We'll track the database status here
    let db: string;

    try {
      // 🔍 Try to run a simple "select 1" query on the database.
      //    This is the lightest possible query — it just checks connectivity.
      //    If it works → db is "up". If it throws → db is "down".
      await prisma.$queryRaw`select 1`;
      db = "up";
    } catch {
      // 🚨 Database query failed — could be a connection issue or DB crash.
      db = "down";
    }

    // 🟢 "ok" is true only if the database is up
    const ok = db === "up";

    // 📤 Send the health status as JSON
    //    - 200 = healthy, 503 = unhealthy (standard HTTP convention)
    //    - uptime: how many seconds the Node.js process has been running
    //    - checks: status of each dependency (db, redis, etc.)
    //    ADHD Note: "redis: not_configured" means we haven't set up Redis yet.
    //              It's a placeholder for future use. 📝
    res.status(ok ? 200 : 503).json({
      ok,
      uptime: Math.round(process.uptime()), // ⏱️ Seconds since server started
      checks: { db, redis: "not_configured" },
    });
  });


  // ─────────────────────────────────────────────────────────
  // 🚫 404 HANDLER — Catch-All for Unknown Routes
  // ─────────────────────────────────────────────────────────
  // 🔧 WHY: If a request doesn't match ANY defined route above,
  //    Express falls through to here. We send a clear 404 error.
  //
  // IMPORTANT: This must come AFTER all your real routes,
  //    otherwise it will intercept valid requests too! ⚠️
  //
  // ADHD Example: This is like the "Page Not Found" message on a website.
  //    Without it, Express would just hang and never respond. 🤷
  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      message: `${req.method} ${req.originalUrl} not found`,
      // e.g. "GET /api/something-wrong not found"
    });
  });


  // ─────────────────────────────────────────────────────────
  // 💥 GLOBAL ERROR HANDLER — Catches ALL unhandled errors
  // ─────────────────────────────────────────────────────────
  // 🔧 WHY: When any route throws an error (or calls next(err)),
  //    Express skips to this special 4-argument middleware.
  //    It sends a proper error response instead of crashing.
  //
  // ⚠️ CRITICAL RULE: Express identifies error handlers by having
  //    EXACTLY 4 parameters: (err, req, res, next). Don't remove any!
  //
  // ADHD Example: This is the "safety net" 🕸️. Even if a route
  //    explodes unexpectedly, the server won't crash — it sends a
  //    clean error message to the client instead.
  app.use((err: HttpError, _req: Request, res: Response, _next: NextFunction) => {
    // Use the error's status code if available, otherwise default to 500
    // Use the error's message if available, otherwise show a generic message
    res.status(err?.status ?? 500).json({
      ok: false,
      message: err?.message ?? "Server error",
    });
  });





  // ─────────────────────────────────────────────────────────
  // 🎁 Return the fully configured app
  // ─────────────────────────────────────────────────────────
  // The server/index.ts file will call createApp() and then
  // call app.listen() to actually start accepting connections.
  // ADHD Note: We RETURN the app but don't start it here —
  //            that separation makes testing much easier. ✅
  return app;
}
