// ============================================================
// 📁 FILE: src/modules/users/users.service.ts
// 🎯 PURPOSE: All DB access + business logic for the users module.
//
// Controllers stay thin (HTTP plumbing only).
// Services are where the actual work happens.
//
// Every function here is pure business logic:
//   no req/res, no HTTP status codes — just data in, data out.
//
// Step 8 endpoints served:
//   8.1 — getMe(userId)           → GET /api/users/me
//   8.2 — searchUsers(query, id)  → GET /api/users?search=
//   8.3 — updateMe(userId, body)  → PATCH /api/users/me  (optional v1)
// ============================================================

import { prisma } from "../../db/prisma.js";
import { toPublicUser } from "../auth/auth.service.js";
import type { PublicUser, UpdateMeBody } from "./users.schemas.js";

// ─── Custom error classes ────────────────────────────────────

/**
 * Thrown when a user row that is expected to exist cannot be found.
 * Normally only happens if a valid JWT references a deleted account.
 */
export class UserNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = "User not found") {
    super(message);
    this.name = "UserNotFoundError";
  }
}

/**
 * Thrown when a requested username is already taken by another account.
 * (PATCH /me username change uniqueness guard.)
 */
export class UsernameConflictError extends Error {
  readonly statusCode = 409;

  constructor(message = "That username is already taken") {
    super(message);
    this.name = "UsernameConflictError";
  }
}

// ─── 8.1: GET /api/users/me ──────────────────────────────────

/**
 * Fetch the currently-authenticated user's public fields from the database.
 *
 * Why fetch from DB and not just return what's in the JWT?
 *   The JWT only carries { sub (id), username }. Fields like avatarAddress
 *   and lastSeen are NOT embedded in the token. Fetching from DB ensures
 *   the response always reflects the current, up-to-date record —
 *   not stale data that was baked into the token at login time.
 *
 * @param userId - The `sub` field from the verified access token (req.user.id).
 * @returns      - The safe public user shape (id, username, avatarAddress, lastSeen).
 * @throws       - UserNotFoundError if the account was deleted since the token was issued.
 */
export async function getMe(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    // Minimal projection — only the fields that make up PublicUser.
    // Never select passwordHash, email, or any private field here.
    select: {
      id: true,
      username: true,
      avatarAddress: true,
      lastSeen: true,
    },
  });

  if (!user) {
    // This can happen if someone uses a real JWT for an account that was
    // deleted after the token was issued. Treat it as 404.
    throw new UserNotFoundError();
  }

  return toPublicUser(user);
}

// ─── 8.2: GET /api/users?search= ─────────────────────────────

/**
 * Search for users by username prefix (case-insensitive).
 *
 * Design decisions baked in:
 *   • Minimum 2 chars — prevents full-table wildcard scans and discourages
 *     brute-force user enumeration (validated by Zod before reaching here).
 *   • Prefix match (`startsWith`) rather than contains — fast index scan
 *     on the username column (Postgres can use a B-tree index for `LIKE 'x%'`).
 *   • Excludes the requesting user — you never appear in your own search.
 *   • Hard limit of 20 rows — keeps response payloads small.
 *   • Returns PublicUser only — never exposes email.
 *
 * @param query    - The search string (already validated: ≥2 chars, trimmed).
 * @param callerId - The authenticated user's id; excluded from results.
 * @returns        - Array of matching PublicUser objects (may be empty).
 */
export async function searchUsers(
  query: string,
  callerId: string,
): Promise<PublicUser[]> {
  const users = await prisma.user.findMany({
    where: {
      // Case-insensitive prefix match on username.
      // Prisma maps `mode: "insensitive"` to `ILIKE` on Postgres.
      username: {
        startsWith: query,
        mode: "insensitive",
      },
      // Never include the requesting user in their own search results.
      NOT: { id: callerId },
    },
    select: {
      id: true,
      username: true,
      avatarAddress: true,
      lastSeen: true,
    },
    take: 20, // hard cap — never return unbounded results
    orderBy: { username: "asc" }, // predictable alphabetical ordering
  });

  return users.map(toPublicUser);
}

// ─── 8.3: PATCH /api/users/me ────────────────────────────────

/**
 * Update the current user's editable profile fields.
 *
 * Only `username` and `avatarAddress` may be changed.
 * Fields omitted from the body are left unchanged (partial-update semantics).
 *
 * Username uniqueness is enforced here with an explicit guard query before
 * the update — this gives us a typed UsernameConflictError instead of a
 * raw Prisma unique-constraint violation, which is harder to handle cleanly
 * in the controller.
 *
 * @param userId - Authenticated user's id (from JWT, never from body).
 * @param body   - Validated partial update body (username?, avatarAddress?).
 * @returns      - The updated PublicUser.
 * @throws       - UsernameConflictError if the new username is taken.
 * @throws       - UserNotFoundError if the account no longer exists.
 */
export async function updateMe(
  userId: string,
  body: UpdateMeBody,
): Promise<PublicUser> {
  const { username, avatarAddress } = body;

  // ── Username uniqueness guard ────────────────────────────
  // Only run this check when the caller is actually changing their username.
  if (username !== undefined) {
    const conflict = await prisma.user.findFirst({
      where: {
        username,
        NOT: { id: userId }, // it's fine if THEY already have this username
      },
      select: { id: true },
    });

    if (conflict) {
      throw new UsernameConflictError();
    }
  }

  // ── Perform the update ───────────────────────────────────
  // Build the data object dynamically — only include keys that were supplied.
  // This avoids accidentally nulling out fields not mentioned in the request.
  const data: { username?: string; avatarAddress?: string | null } = {};
  if (username !== undefined) data.username = username;
  if (avatarAddress !== undefined) data.avatarAddress = avatarAddress;

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        username: true,
        avatarAddress: true,
        lastSeen: true,
      },
    });

    return toPublicUser(updated);
  } catch (err) {
    // Prisma throws P2025 ("Record to update not found") if the user was
    // deleted between the guard check and the update — convert to our error.
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "P2025"
    ) {
      throw new UserNotFoundError();
    }
    throw err;
  }
}
