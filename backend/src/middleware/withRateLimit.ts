// ============================================================
// 📁 FILE: src/middleware/withRateLimit.ts
// 🎯 PURPOSE: Shared Express middleware factory for rate limiting.
//
// Previously this function lived inline in auth.routes.ts.
// It is extracted here so every router that needs rate limiting
// (auth, uploads, conversations, etc.) can import one canonical
// implementation instead of copy-pasting.
//
// Usage:
//   import { withRateLimit } from "../../middleware/withRateLimit.js";
//   import { uploadSignLimiter } from "../../utils/rateLimiter.js";
//
//   router.post("/sign", authenticate, withRateLimit(uploadSignLimiter), ...);
//
// If the limit is exceeded the middleware responds immediately with:
//   HTTP 429  { ok: false, code: "TOO_MANY_REQUESTS", message: "..." }
// and sets the Retry-After header. next() is never called.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import type { rateLimiter } from "../utils/rateLimiter.js";

/**
 * Build an Express middleware that checks the given limiter for `req.ip`.
 *
 * If the limit is exceeded it immediately responds 429 Too Many Requests
 * with a `Retry-After` header and never calls next().
 *
 * @param limiter - A limiter instance created by the `rateLimiter()` factory.
 *
 * @example
 * router.post("/sign", authenticate, withRateLimit(uploadSignLimiter), controller);
 */
export function withRateLimit(
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
