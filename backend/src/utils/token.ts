import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// ─── Payload ─────────────────────────────────────────────────────────────────

/**
 * The data embedded in every JWT issued by this server.
 *
 * Rules:
 *  • Include only the minimum identity needed to authorise a request.
 *  • NEVER put passwordHash, email, or any verification flag in here —
 *    those are private and have no place in a bearer token.
 */
export interface TokenPayload {
  /** The user's UUID (primary key in the User table). */
  sub: string;
  /** The user's public username (useful for display without a DB hit). */
  username: string;
}

// ─── Discriminated token type ─────────────────────────────────────────────────

/** Narrow result type returned by both verify functions. */
export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; error: string };

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Sign a JWT with the given secret and TTL.
 * The payload is typed so callers can't accidentally add forbidden fields.
 */
function sign(payload: TokenPayload, secret: string, expiresIn: string): string {
  // jwt.sign accepts StringValue for expiresIn in v9; cast to `any` avoids the
  // over-constrained type mismatch while keeping everything else strictly typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(payload, secret, { expiresIn: expiresIn as any });
}

/**
 * Verify a JWT, returning a typed discriminated union so callers are forced
 * to handle both the success and failure paths.
 */
function verify(token: string, secret: string): VerifyResult {
  try {
    const decoded = jwt.verify(token, secret) as TokenPayload;
    return { ok: true, payload: decoded };
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid token";
    return { ok: false, error: message };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create a short-lived access token (default: 15 min).
 *
 * This token is sent with every authenticated API request.
 * It is stateless — the server does not store it.
 *
 * @param userId   - `User.id` (UUID)
 * @param username - `User.username`
 */
export function createAccessToken(userId: string, username: string): string {
  return sign(
    { sub: userId, username },
    env.JWT_ACCESS_SECRET,
    env.JWT_ACCESS_EXPIRES_IN,
  );
}

/**
 * Create a long-lived refresh token (default: 7 days).
 *
 * This token is stored in the `RefreshToken` table and rotated on use.
 * It must be sent over HttpOnly cookies only — never exposed to JavaScript.
 *
 * @param userId   - `User.id` (UUID)
 * @param username - `User.username`
 */
export function createRefreshToken(userId: string, username: string): string {
  return sign(
    { sub: userId, username },
    env.JWT_REFRESH_SECRET,
    env.JWT_REFRESH_EXPIRES_IN,
  );
}

/**
 * Verify an access token.
 *
 * Returns `{ ok: true, payload }` on success, or `{ ok: false, error }` when
 * the token is malformed, expired, or signed with the wrong key.
 *
 * @example
 * const result = verifyAccessToken(token);
 * if (!result.ok) return res.status(401).json({ error: result.error });
 * // result.payload is TokenPayload here
 */
export function verifyAccessToken(token: string): VerifyResult {
  return verify(token, env.JWT_ACCESS_SECRET);
}

/**
 * Verify a refresh token.
 *
 * Same contract as `verifyAccessToken`. Always double-check the returned
 * payload's `sub` against the `RefreshToken` table before issuing new tokens.
 *
 * @example
 * const result = verifyRefreshToken(token);
 * if (!result.ok) return res.status(401).json({ error: result.error });
 * // result.payload is TokenPayload here
 */
export function verifyRefreshToken(token: string): VerifyResult {
  return verify(token, env.JWT_REFRESH_SECRET);
}
