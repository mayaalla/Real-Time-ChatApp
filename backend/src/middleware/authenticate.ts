// ============================================================
// 📁 FILE: src/middleware/authenticate.ts
// 🎯 PURPOSE: Express middleware — the "authentication guard".
//
//    It runs BEFORE protected route handlers and does three things:
//      1. Reads the access token from the Authorization header (Bearer form).
//      2. Verifies it is a valid, unexpired JWT signed with our secret.
//      3. Attaches the decoded user payload to `req` so handlers can use it.
//
//    If anything fails, it immediately responds with 401 Unauthorised
//    and NEVER calls next() — the route handler is never reached.
//
// 🧠 ADHD TIP: Think of this like a bouncer at a club door.
//    No valid wristband (JWT) → you don't get in. ✋🚫
//    Valid wristband → bouncer stamps your hand (req.user) and lets you in. 🎟️
//
// 📌 TYPE STRATEGY:
//    We cast the request to `AuthenticatedRequest` AFTER verifying the token.
//    This is the ONLY place that cast is done. All downstream handlers simply
//    declare `req: AuthenticatedRequest` and trust it is populated.
//    See docs/auth-request-typing.md for the full decision record.
// ============================================================


// ─────────────────────────────────────────────────────────────
// 📦 IMPORTS
// ─────────────────────────────────────────────────────────────

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/token.js";
import type { AuthenticatedRequest, RequestUser } from "../types/express.js";


// ─────────────────────────────────────────────────────────────
// 🔑 TOKEN EXTRACTION
// ─────────────────────────────────────────────────────────────

/**
 * Pull the Bearer token out of the Authorization header.
 *
 * Expected format: `Authorization: Bearer <token>`
 *
 * Returns the raw token string, or `null` if the header is missing
 * or has the wrong format.
 *
 * NOTE: Per Step 7.9 the access token MUST come from the header,
 * not from a cookie.  Cookies are reserved for the refresh token.
 */
function extractFromHeader(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  // The header must start with "Bearer " (case-sensitive, one space).
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  return token;
}


// ─────────────────────────────────────────────────────────────
// 🛡️ MIDDLEWARE: authenticate
// ─────────────────────────────────────────────────────────────

/**
 * Express middleware that protects routes by verifying a JWT access token.
 *
 * Mount it on any route (or router) that requires a logged-in user:
 *
 *   import { authenticate } from "../../middleware/authenticate.js";
 *
 *   // Protect a single route:
 *   router.get("/me", authenticate, meController);
 *
 *   // Protect an entire router:
 *   router.use(authenticate);
 *
 * On success  → attaches `req.user` (type: RequestUser) and calls next().
 * On failure  → responds with 401 JSON and does NOT call next().
 *
 * Possible 401 codes (used by the frontend to decide whether to refresh):
 *   - MISSING_TOKEN   : No Authorization header / wrong format.
 *   - TOKEN_EXPIRED   : Signature valid but `exp` has passed.
 *                       Frontend should call POST /api/auth/refresh then retry.
 *   - INVALID_TOKEN   : Bad signature, malformed JWT, or wrong secret.
 *   - MALFORMED_TOKEN : Signature OK but required payload fields are absent.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // ── Step 1: Extract the Bearer token from the header ───────
  const token = extractFromHeader(req);

  if (!token) {
    res.status(401).json({
      ok: false,
      code: "MISSING_TOKEN",
      message: "Authentication required. Provide an Authorization: Bearer <token> header.",
    });
    return; // do NOT call next()
  }

  // ── Step 2: Verify the token (signature + expiry) ──────────
  // verifyAccessToken() returns a discriminated union so we are forced
  // to handle both paths without try/catch.
  const result = verifyAccessToken(token);

  if (!result.ok) {
    // Distinguish "expired" from "bad" so the frontend can decide to refresh.
    const isExpired = result.error.toLowerCase().includes("expired");

    res.status(401).json({
      ok: false,
      code: isExpired ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
      message: isExpired
        ? "Access token has expired. Please refresh your session."
        : "Access token is invalid.",
    });
    return;
  }

  // ── Step 3: Validate payload shape ─────────────────────────
  const { sub, username } = result.payload;

  if (!sub || !username) {
    res.status(401).json({
      ok: false,
      code: "MALFORMED_TOKEN",
      message: "Access token payload is missing required fields.",
    });
    return;
  }

  // ── Step 4: Attach the user to the request ─────────────────
  // This is the ONE authoritative place we cast to AuthenticatedRequest.
  // All downstream handlers can safely declare (req: AuthenticatedRequest).
  //
  // Note: our TokenPayload has { sub, username } — no email field.
  // RequestUser.email is omitted here; if a handler needs the email it
  // must fetch it from the DB using req.user.id.
  const user: RequestUser = {
    id: sub,
    email: "",      // not embedded in the JWT (see TokenPayload in token.ts)
    username,
  };

  (req as unknown as AuthenticatedRequest).user = user;

  // ── Step 5: Pass control to the next handler ───────────────
  next();
}
