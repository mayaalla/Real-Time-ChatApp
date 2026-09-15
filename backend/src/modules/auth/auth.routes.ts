// ============================================================
// 📁 FILE: src/modules/auth/auth.routes.ts
// 🎯 PURPOSE: Mount auth endpoints on an Express Router.
//
// This router is imported once in app.ts and mounted at /api/auth.
// Each route:
//   1. Applies a per-IP rate limiter (5 attempts / 15 min).
//   2. Runs the validate() middleware (schema enforced, for body routes).
//   3. Then calls the controller (pure HTTP plumbing).
// ============================================================

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import {
  loginLimiter,
  refreshLimiter,
  registerLimiter,
} from "../../utils/rateLimiter.js";
import type { rateLimiter } from "../../utils/rateLimiter.js";
import {
  loginController,
  logoutController,
  refreshController,
  registerController,
} from "./auth.controller.js";
import { LoginBodySchema, RegisterBodySchema } from "./auth.schemas.js";

const router = Router();

// ─── Rate-limit middleware factory ───────────────────────────

/**
 * Build an Express middleware that checks the given limiter for `req.ip`.
 *
 * If the limit is exceeded it immediately responds 429 Too Many Requests
 * with a `Retry-After` header and never calls next().
 */
function withRateLimit(
  limiter: ReturnType<typeof rateLimiter>,
) {
  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const ip = req.ip ?? "unknown";

    if (!limiter.check(ip)) {
      const retryAfter = limiter.retryAfterSeconds(ip);
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({
        ok: false,
        code: "TOO_MANY_REQUESTS",
        message: `Too many attempts. Please try again in ${retryAfter} seconds.`,
      });
      return;
    }

    next();
  };
}

// ── POST /api/auth/register ───────────────────────────────────
// Rate-limited → schema-validated → register.
router.post(
  "/register",
  withRateLimit(registerLimiter),
  validate({ body: RegisterBodySchema }),
  registerController,
);

// ── POST /api/auth/login ──────────────────────────────────────
// Rate-limited → schema-validated → login.
router.post(
  "/login",
  withRateLimit(loginLimiter),
  validate({ body: LoginBodySchema }),
  loginController,
);

// ── POST /api/auth/refresh ────────────────────────────────────
// Rate-limited → refresh (reads HttpOnly cookie, rotates token pair).
router.post(
  "/refresh",
  withRateLimit(refreshLimiter),
  refreshController,
);

// ── POST /api/auth/logout ─────────────────────────────────────
// No rate limit needed — logging out is always safe to allow.
// Reads HttpOnly cookie, revokes DB row, clears cookie.
router.post("/logout", logoutController);

export default router;
