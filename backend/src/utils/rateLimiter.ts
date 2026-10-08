// ============================================================
// 📁 FILE: src/utils/rateLimiter.ts
// 🎯 PURPOSE: Simple per-IP rate limiting for auth endpoints.
//
// ⚠️  IN-MEMORY WARNING — READ BEFORE SHIPPING:
//    This implementation counts attempts in a plain JS Map.
//    That is WRONG the moment you run two or more server
//    instances (e.g. with pm2 cluster mode, Kubernetes, etc.)
//    because each process has its own counter and the limits
//    are NOT enforced globally.
//
//    TODO (Part 15): Replace the body of `rateLimiter()` with a
//    Redis-backed counter (e.g. INCR + EXPIRE via ioredis).
//    The exported function signature stays identical so no call
//    site needs to change.
// ============================================================

// ─── Types ───────────────────────────────────────────────────

interface RateLimiterOptions {
  /** Maximum number of attempts allowed in the window. */
  maxAttempts: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

interface AttemptRecord {
  count: number;
  /** Absolute timestamp (ms) when the window resets. */
  resetAt: number;
}

// ─── Factory ─────────────────────────────────────────────────

/**
 * Create a rate limiter for a specific endpoint.
 *
 * Each call to this factory returns an independent limiter with its
 * own in-memory counter map.  Mount one limiter per route so counters
 * don't bleed between endpoints.
 *
 * @example
 * // Create a limiter: 5 attempts per 15 minutes per IP.
 * const loginLimiter = rateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });
 *
 * // In your route:
 * if (!loginLimiter.check(req.ip)) {
 *   return res.status(429).json({ ok: false, code: "TOO_MANY_REQUESTS", ... });
 * }
 */
export function rateLimiter(options: RateLimiterOptions) {
  const { maxAttempts, windowMs } = options;

  // key → { count, resetAt }
  // In-memory only — see the file-level warning above.
  const store = new Map<string, AttemptRecord>();

  /**
   * Check whether `key` (typically an IP address) has exceeded the limit.
   *
   * Returns `true` if the request is allowed, `false` if it should be
   * rate-limited.  Internally increments the counter on each call.
   */
  function check(key: string): boolean {
    const now = Date.now();
    const record = store.get(key);

    if (!record || now >= record.resetAt) {
      // First attempt in this window — start a fresh counter.
      store.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (record.count >= maxAttempts) {
      // Window is still active and the limit has been hit.
      return false;
    }

    // Within the window and under the limit — increment.
    record.count += 1;
    return true;
  }

  /**
   * How many seconds until the window resets for `key`.
   * Returns 0 if no record exists (i.e. the key is clean).
   * Useful for the `Retry-After` response header.
   */
  function retryAfterSeconds(key: string): number {
    const now = Date.now();
    const record = store.get(key);
    if (!record || now >= record.resetAt) return 0;
    return Math.ceil((record.resetAt - now) / 1000);
  }

  return { check, retryAfterSeconds } as const;
}

// ─── Shared limiter instances ─────────────────────────────────
// One limiter per restricted endpoint.

// Auth endpoints: 5 attempts per 15 minutes per IP.
const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const AUTH_MAX_ATTEMPTS = 5;

export const registerLimiter = rateLimiter({
  maxAttempts: AUTH_MAX_ATTEMPTS,
  windowMs: AUTH_WINDOW_MS,
});

export const loginLimiter = rateLimiter({
  maxAttempts: AUTH_MAX_ATTEMPTS,
  windowMs: AUTH_WINDOW_MS,
});

// The refresh endpoint is not a brute-force vector — it requires a valid
// HttpOnly cookie that an attacker cannot read from JS. A tight limit here
// causes legitimate users (who refresh the page several times or have
// multiple tabs open) to hit 429 and get kicked to /login.
// 30 attempts per 15 min is safe and far more than any normal user needs.
export const refreshLimiter = rateLimiter({
  maxAttempts: 30,
  windowMs: AUTH_WINDOW_MS,
});

// Upload sign endpoint: tighter limit — 10 signed tokens per 60 s per IP.
// Prevents Cloudinary API quota exhaustion by authenticated users.
export const uploadSignLimiter = rateLimiter({
  maxAttempts: 10,
  windowMs: 60 * 1000, // 60 seconds
});
