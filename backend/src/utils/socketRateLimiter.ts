import { redisClient } from "../redis/client.js";



// ─── Config ───────────────────────────────────────────────────────────────────
// How many messages one user can send inside one time window.
export const MSG_LIMIT    = 20;     // 20 messages …
export const MSG_WINDOW_S = 60;     // … per 60 seconds

// Lighter limit for noisy-but-harmless events (typing, join, sync).
export const NOISE_LIMIT    = 60;   // 60 events …
export const NOISE_WINDOW_S = 60;   // … per 60 seconds

// ─── Key builder ──────────────────────────────────────────────────────────────
// Returns the Redis key for this user's counter in the current time window.
// windowSeconds controls the length of each window (60s for messages).

function rateLimitKey(userId: string, windowSeconds: number): string {
    // "What window are we in right now?"
    // Floor the current time to the nearest multiple of windowSeconds.
    // Example: windowSeconds=60  →  every minute gets a new key.
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    return `ratelimit:${userId}:${windowStart}`;
  }

  
// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Check if userId has exceeded limit within windowSeconds.
 *
 * Returns { allowed: true }  if the request should proceed.
 * Returns { allowed: false, retryAfter: number }  if they are over the limit.
 *   retryAfter = seconds until the window resets (for the error message).
 *
 * IMPORTANT: This function ALWAYS increments the counter on every call,
 * even for the first request. Redis INCR creates the key if it doesn't exist.
 * We set EXPIRE only on the FIRST increment (when the counter was just created).
 */
export async function checkSocketRateLimit(
    userId:        string,
    limit:         number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfter: number }> {
  
    const key = rateLimitKey(userId, windowSeconds);
  
    // INCR: adds 1 to the counter and returns the new value.
    // If the key did not exist, Redis creates it with value 0 first, then adds 1.
    // Result is the new count (1, 2, 3, … up to limit+1 and beyond).
    const count = await redisClient.incr(key);
  
    // On first increment (count === 1), set the expiry.
    // We only do this once so we don't accidentally extend the window on every request.
    if (count === 1) {
      await redisClient.expire(key, windowSeconds);
    }
  
    if (count > limit) {
      // How many seconds until the current window ends?
      // TTL returns the remaining lifetime of the key in seconds.
      const ttl = await redisClient.ttl(key);
      return { allowed: false, retryAfter: Math.max(ttl, 1) };
    }
  
    return { allowed: true, retryAfter: 0 };
  }
  