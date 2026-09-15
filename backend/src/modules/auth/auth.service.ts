// ============================================================
// 📁 FILE: src/modules/auth/auth.service.ts
// 🎯 PURPOSE: All database + crypto logic for auth operations.
//
// Controllers stay thin (HTTP plumbing only).
// Services are where the actual work happens.
//
// Every function here is pure business logic:
//   no req/res, no HTTP status codes — just data in, data out.
// ============================================================

import { prisma } from "../../db/prisma.js";
import { comparePassword, hashPassword } from "../../utils/password.js";
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from "../../utils/token.js";
import type { LoginBody, PublicUser, RegisterBody } from "./auth.schemas.js";

// ─── Conflict sentinel ───────────────────────────────────────

/**
 * Thrown when the email OR username is already in use.
 *
 * We deliberately say "already taken" without specifying which field —
 * this prevents user enumeration (an attacker cannot probe for valid emails
 * by submitting one field at a time and watching which error fires).
 */
export class ConflictError extends Error {
  readonly statusCode = 409;

  constructor(message = "An account with those details already exists") {
    super(message);
    this.name = "ConflictError";
  }
}

// ─── Shared helper ───────────────────────────────────────────

/**
 * Strip every private column from a Prisma User row and return only the
 * fields that are safe to send to any client.
 *
 * This is the SINGLE place that defines "public user fields". Import and
 * call this function everywhere a user object must leave the server:
 *   - register response
 *   - login response
 *   - GET /me
 *   - profile endpoints
 *
 * The return type `PublicUser` is authoritative for the whole API.
 */
export function toPublicUser(user: {
  id: string;
  username: string;
  avatarAddress: string | null;
  lastSeen: Date | null;
}): PublicUser {
  return {
    id: user.id,
    username: user.username,
    avatarAddress: user.avatarAddress,
    lastSeen: user.lastSeen,
  };
}

// ─── Token-pair helper ───────────────────────────────────────

/**
 * Issue a fresh access + refresh token pair for `userId` / `username`,
 * persisting the refresh token in the `RefreshToken` table.
 *
 * The refresh token itself is the raw JWT string — it is stored as the
 * primary key in `RefreshToken` (see schema.prisma). On rotation the old
 * row is deleted (or revoked) and a new one is inserted.
 *
 * @returns `{ accessToken, refreshToken }` — both are raw JWT strings.
 */
async function issueTokenPair(
  userId: string,
  username: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = createAccessToken(userId, username);
  const refreshToken = createRefreshToken(userId, username);

  // Derive the absolute expiry from the env-configured TTL.
  // We parse "7d" / "15m" / "1h" manually because jsonwebtoken doesn't
  // expose a helper that converts its expiresIn strings to Date objects.
  const refreshTtlMs = parseDurationToMs(
    process.env["JWT_REFRESH_EXPIRES_IN"] ?? "7d",
  );

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      ownerId: userId,
      expiry: new Date(Date.now() + refreshTtlMs),
    },
  });

  return { accessToken, refreshToken };
}

/**
 * Very small duration parser that handles the subset of strings
 * used by jsonwebtoken (`"15m"`, `"1h"`, `"7d"`).
 * Throws if the format is unrecognised.
 */
function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration);
  if (!match) throw new Error(`Unparseable duration string: "${duration}"`);

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return value * multipliers[unit]!;
}

// ─── Register ────────────────────────────────────────────────

/**
 * Create a new user account.
 *
 * Steps:
 *   1. Check for email / username collision — throw ConflictError if found
 *      (single query, no timing oracle that reveals which field matched).
 *   2. Hash the password with bcrypt (cost 12 — see password.ts).
 *   3. Persist the user row.
 *   4. Issue a fresh token pair (access + refresh).
 *   5. Return the public user fields + both tokens.
 *
 * @throws ConflictError when email or username is already registered.
 */
export async function registerUser(body: RegisterBody): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  const { email, username, password } = body;

  // ── Step 1: Uniqueness check ─────────────────────────────
  // A single OR query so we can tell whether either field conflicts while
  // leaking no information about which one matched to the HTTP layer.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { id: true }, // minimal projection — we only need to know it exists
  });

  if (existing) {
    throw new ConflictError();
  }

  // ── Step 2: Hash password ────────────────────────────────
  const passwordHash = await hashPassword(password);

  // ── Step 3: Create user ──────────────────────────────────
  // `name` is required by the schema — seed it from username so callers
  // don't need to supply a separate display name at sign-up.
  // A profile-update endpoint can change it later.
  const user = await prisma.user.create({
    data: {
      email,
      username,
      name: username, // editable later via profile update
      passwordHash,
      // avatarAddress and lastSeen deliberately omitted → default to null
    },
    select: {
      id: true,
      username: true,
      avatarAddress: true,
      lastSeen: true,
    },
  });

  // ── Step 4: Issue tokens ─────────────────────────────────
  const { accessToken, refreshToken } = await issueTokenPair(
    user.id,
    user.username,
  );

  // ── Step 5: Return safe payload ──────────────────────────
  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
  };
}

// ─── Login ───────────────────────────────────────────────────

/**
 * Thrown when the credentials supplied do not match any account.
 *
 * We deliberately use the same message for "no such account" and
 * "wrong password" — an attacker cannot tell which emails are registered
 * by observing which error fires.
 */
export class UnauthorisedError extends Error {
  readonly statusCode = 401;

  constructor(message = "Invalid credentials") {
    super(message);
    this.name = "UnauthorisedError";
  }
}

/**
 * Verify the supplied credentials and, on success, issue a fresh token pair.
 *
 * Steps:
 *   1. Look up the account by email OR username (single query).
 *   2. Always run bcrypt.compare — even if no user was found — so the
 *      response time is identical in both failure cases (timing-safe).
 *   3. Throw UnauthorisedError for any mismatch (no field hints).
 *   4. Issue a fresh access + refresh token pair.
 *   5. Update `lastSeen` in a fire-and-forget UPDATE (non-blocking).
 *   6. Return the public user fields + both tokens.
 *
 * @throws UnauthorisedError when no account matches or the password is wrong.
 */
export async function loginUser(body: LoginBody): Promise<{
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}> {
  const { email, username, password } = body;

  // ── Step 1: Fetch the candidate account ─────────────────
  // A single OR query covers both login-by-email and login-by-username.
  // We select only the minimum columns needed for auth + the public shape.
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(email ? [{ email }] : []),
        ...(username ? [{ username }] : []),
      ],
    },
    select: {
      id: true,
      username: true,
      passwordHash: true,
      avatarAddress: true,
      lastSeen: true,
    },
  });

  // ── Step 2: Constant-time password comparison ────────────
  // IMPORTANT: We ALWAYS call bcrypt.compare, even when `user` is null.
  // Returning early before bcrypt would make the "no user found" path
  // significantly faster than the "wrong password" path, leaking which
  // emails exist via a timing side-channel.
  //
  // When no user is found we compare against a static dummy hash that
  // will always fail — this keeps the timing profile identical.
  const DUMMY_HASH =
    "$2b$12$invalidsaltXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

  const passwordMatches = await comparePassword(
    password,
    user?.passwordHash ?? DUMMY_HASH,
  );

  // ── Step 3: Reject any mismatch ──────────────────────────
  // One generic error for both "no account" and "wrong password".
  if (!user || !passwordMatches) {
    throw new UnauthorisedError();
  }

  // ── Step 4: Issue tokens ─────────────────────────────────
  const { accessToken, refreshToken } = await issueTokenPair(
    user.id,
    user.username,
  );

  // ── Step 5: Touch lastSeen (fire-and-forget) ─────────────
  // We don't await this — a failure here must NOT break login.
  // The value is informational; stale by seconds is acceptable.
  prisma.user
    .update({ where: { id: user.id }, data: { lastSeen: new Date() } })
    .catch(() => {
      // silently ignore — lastSeen is best-effort
    });

  // ── Step 6: Return safe payload ──────────────────────────
  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
  };
}

// ─── Refresh ─────────────────────────────────────────────────

/**
 * Thrown by refreshSession / logoutUser when the refresh token is
 * missing, expired, already revoked, or signed with the wrong key.
 * The controller maps this to a 401 and clears the cookie.
 */
export class InvalidRefreshTokenError extends Error {
  readonly statusCode = 401;

  constructor(message = "Refresh token is invalid or has expired") {
    super(message);
    this.name = "InvalidRefreshTokenError";
  }
}

/**
 * Rotate the refresh token: validate the incoming token, invalidate it in
 * the database, and issue a fresh access + refresh pair.
 *
 * Security properties:
 *  • The old token is marked `revoked = true` before the new one is written —
 *    replaying the old value after rotation always gets a 401.
 *  • We verify the JWT signature AND check the DB row (revoked / expiry)
 *    so a valid-looking but already-used token is still rejected.
 *  • If the token is not in the DB at all (e.g. never issued by us), we reject.
 *
 * @throws InvalidRefreshTokenError for any invalid / expired / replayed token.
 */
export async function refreshSession(rawToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  // ── Step 1: Verify the JWT signature ────────────────────
  const result = verifyRefreshToken(rawToken);
  if (!result.ok) {
    throw new InvalidRefreshTokenError(result.error);
  }

  const { sub: userId, username } = result.payload;

  // ── Step 2: Look up the token in the DB ─────────────────
  // We check that it exists, belongs to the right user, is not
  // revoked, and has not passed its hard expiry.
  const stored = await prisma.refreshToken.findUnique({
    where: { token: rawToken },
    select: { ownerId: true, revoked: true, expiry: true },
  });

  if (
    !stored ||
    stored.ownerId !== userId ||
    stored.revoked ||
    stored.expiry < new Date()
  ) {
    throw new InvalidRefreshTokenError();
  }

  // ── Step 3: Revoke the old token ────────────────────────
  // Mark it revoked BEFORE issuing the new pair.
  // If the process crashes between these two DB writes, the client
  // would need to re-login — acceptable for the in-memory era.
  await prisma.refreshToken.update({
    where: { token: rawToken },
    data: { revoked: true },
  });

  // ── Step 4: Issue a fresh pair ───────────────────────────
  const { accessToken, refreshToken } = await issueTokenPair(userId, username);

  return { accessToken, refreshToken };
}

// ─── Logout ──────────────────────────────────────────────────

/**
 * Invalidate the refresh token stored for this session.
 *
 * After this call succeeds the old cookie value can never be used again.
 * The controller is responsible for clearing the cookie on the response.
 *
 * We silently succeed if the token is not in the DB — the cookie will be
 * cleared either way, which is the important part.
 *
 * @throws InvalidRefreshTokenError only if the JWT signature is invalid
 *         (a sign of tampering — we still clear the cookie in the controller).
 */
export async function logoutUser(rawToken: string): Promise<void> {
  // Verify the JWT first so we can derive ownerId for the DB query.
  // We do NOT throw on an already-expired JWT here — the user is logging
  // out, so clearing the DB row is the right thing regardless.
  const result = verifyRefreshToken(rawToken);
  if (!result.ok) {
    // Token is malformed / signed with wrong key — nothing to revoke.
    // We return without throwing so the controller always clears the cookie.
    return;
  }

  const { sub: userId } = result.payload;

  // Revoke the DB row if it still exists and belongs to this user.
  // `updateMany` avoids a 404-equivalent error if the row is already gone.
  await prisma.refreshToken.updateMany({
    where: { token: rawToken, ownerId: userId, revoked: false },
    data: { revoked: true },
  });
}
