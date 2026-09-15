// ============================================================
// 📁 FILE: src/modules/auth/auth.controller.ts
// 🎯 PURPOSE: HTTP layer for auth routes — thin wrappers only.
//
// Controllers do exactly three things:
//   1. Pull validated data off req.body / req.cookies.
//   2. Call the service.
//   3. Map the result (or error) to an HTTP response.
//
// No database calls, no crypto — those live in auth.service.ts.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import {
  ConflictError,
  InvalidRefreshTokenError,
  UnauthorisedError,
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
} from "./auth.service.js";
import type { LoginBody, RegisterBody } from "./auth.schemas.js";

// ─── Cookie helper ───────────────────────────────────────────

/**
 * Options shared by every call that sets the refresh-token cookie.
 * maxAge must match JWT_REFRESH_EXPIRES_IN (7 days).
 */
const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

/**
 * Clear the refresh-token cookie — used on logout and on invalid refresh.
 * Setting maxAge to 0 (or using res.clearCookie) immediately expires it.
 */
function clearRefreshCookie(res: Response): void {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "strict",
  });
}

// ─── POST /api/auth/register ─────────────────────────────────

/**
 * Register a new user account.
 *
 * Expects req.body to have already been validated (and typed) by the
 * `validate({ body: RegisterBodySchema })` middleware mounted in routes.
 *
 * On success  → 201 Created with user public fields + access token.
 * On conflict → 409 Conflict with a generic message (no field hints).
 * On any other error → passes to the global error handler via next(err).
 *
 * The refreshToken is sent as an HttpOnly cookie so it is never accessible
 * to JavaScript. The accessToken is returned in the JSON body so the client
 * can store it in memory and attach it to API requests as a Bearer token.
 */
export async function registerController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as RegisterBody;

    const { user, accessToken, refreshToken } = await registerUser(body);

    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(201).json({
      ok: true,
      data: { user, accessToken },
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      res.status(409).json({
        ok: false,
        code: "CONFLICT",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}

// ─── POST /api/auth/login ─────────────────────────────────────

/**
 * Authenticate an existing user account.
 *
 * Expects req.body to have already been validated (and typed) by the
 * `validate({ body: LoginBodySchema })` middleware mounted in routes.
 *
 * On success  → 200 OK with public user fields + access token.
 * On bad creds→ 401 Unauthorised with a GENERIC message (no field hints).
 *              Both "unknown account" and "wrong password" get the same
 *              response so an attacker cannot enumerate registered emails.
 * On any other error → passes to the global error handler via next(err).
 */
export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as LoginBody;

    const { user, accessToken, refreshToken } = await loginUser(body);

    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(200).json({
      ok: true,
      data: { user, accessToken },
    });
  } catch (err) {
    if (err instanceof UnauthorisedError) {
      res.status(401).json({
        ok: false,
        code: "UNAUTHORISED",
        // Intentionally generic — do NOT say "wrong password" or "no account".
        message: "Invalid credentials",
      });
      return;
    }

    next(err);
  }
}

// ─── POST /api/auth/refresh ───────────────────────────────────

/**
 * Rotate the refresh token and issue a fresh access + refresh pair.
 *
 * Flow:
 *   1. Read the `refreshToken` HttpOnly cookie.
 *   2. Verify the JWT signature.
 *   3. Check it is still valid in the `RefreshToken` table (not revoked/expired).
 *   4. Revoke the old token row.
 *   5. Issue a fresh pair and set the new cookie.
 *
 * Any failure (missing cookie, expired token, already-used token) →
 *   401 Unauthorised + cookie cleared so the browser doesn't keep sending it.
 *
 * Calling this repeatedly always works (each call produces a new pair).
 * Replaying an old cookie value always fails (it was revoked on first use).
 */
export async function refreshController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // ── Step 1: Read the cookie ─────────────────────────────
  const rawToken: unknown = req.cookies["refreshToken"];

  if (typeof rawToken !== "string" || rawToken.length === 0) {
    clearRefreshCookie(res);
    res.status(401).json({
      ok: false,
      code: "MISSING_REFRESH_TOKEN",
      message: "No refresh token provided.",
    });
    return;
  }

  try {
    // ── Steps 2-5: Delegate to the service ─────────────────
    const { accessToken, refreshToken } = await refreshSession(rawToken);

    res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);

    res.status(200).json({
      ok: true,
      data: { accessToken },
    });
  } catch (err) {
    if (err instanceof InvalidRefreshTokenError) {
      // Always clear the stale/bad cookie so the browser stops sending it.
      clearRefreshCookie(res);
      res.status(401).json({
        ok: false,
        code: "INVALID_REFRESH_TOKEN",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}

// ─── POST /api/auth/logout ────────────────────────────────────

/**
 * Invalidate the current session and clear the refresh-token cookie.
 *
 * Flow:
 *   1. Read the `refreshToken` cookie.
 *   2. Revoke the DB row (silently succeeds if already gone / invalid).
 *   3. Clear the cookie.
 *   4. Respond 204 No Content.
 *
 * After a successful logout, calling /refresh with the old cookie fails.
 * We always respond 204 even when no cookie was present — the outcome
 * (the user is logged out) is the same either way.
 */
export async function logoutController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const rawToken: unknown = req.cookies["refreshToken"];

  try {
    if (typeof rawToken === "string" && rawToken.length > 0) {
      // Revoke the DB row — silently handles missing/expired tokens.
      await logoutUser(rawToken);
    }

    // Always clear the cookie, regardless of whether the token was valid.
    clearRefreshCookie(res);

    res.status(204).send();
  } catch (err) {
    // If the DB call fails unexpectedly, still clear the cookie.
    clearRefreshCookie(res);
    next(err);
  }
}
