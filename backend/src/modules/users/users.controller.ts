// ============================================================
// 📁 FILE: src/modules/users/users.controller.ts
// 🎯 PURPOSE: HTTP layer for user routes — thin wrappers only.
//
// Controllers do exactly three things:
//   1. Pull validated data off req / req.cookies / req.user.
//   2. Call the service.
//   3. Map the result (or error) to an HTTP response.
//
// No database calls, no business logic — those live in users.service.ts.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../types/express.js";
import {
  UserNotFoundError,
  UsernameConflictError,
  getMe,
  searchUsers,
  updateMe,
} from "./users.service.js";
import type { SearchQuery, UpdateMeBody } from "./users.schemas.js";

// ─── GET /api/users/me ───────────────────────────────────────

/**
 * Return the current user's public profile.
 *
 * The `authenticate` middleware runs before this handler and attaches
 * `req.user.id` (from the verified JWT). We pass that id directly to
 * the service — we never trust a user-supplied id in the body or query.
 *
 * On success  → 200 OK  with { ok: true, data: PublicUser }
 * On not found→ 404 (account deleted since token was issued)
 * On any other error → passes to the global error handler via next(err).
 */
export async function getMeController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // `authenticate` has already verified the JWT and attached req.user,
    // so the cast to AuthenticatedRequest is always safe here.
    const { id: userId } = (req as unknown as AuthenticatedRequest).user;

    const user = await getMe(userId);

    res.status(200).json({
      ok: true,
      data: { user },
    });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({
        ok: false,
        code: "USER_NOT_FOUND",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}

// ─── GET /api/users?search= ──────────────────────────────────

/**
 * Search for users by username prefix.
 *
 * The `validate({ query: SearchQuerySchema })` middleware runs before this
 * and ensures req.query.search exists and has ≥2 characters.
 *
 * On success  → 200 OK  with { ok: true, data: { users: PublicUser[] } }
 * On any error → passes to the global error handler via next(err).
 */
export async function searchUsersController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: callerId } = (req as unknown as AuthenticatedRequest).user;

    // Zod has already coerced / validated req.query — safe to cast.
    const { search } = req.query as unknown as SearchQuery;

    const users = await searchUsers(search, callerId);

    res.status(200).json({
      ok: true,
      data: { users },
    });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/users/me ─────────────────────────────────────

/**
 * Update the current user's editable profile fields (optional v1 — Step 8.3).
 *
 * Allowed changes: username, avatarAddress.
 * All fields are optional — send only what you want to change.
 *
 * On success   → 200 OK  with { ok: true, data: { user: PublicUser } }
 * On conflict  → 409 Conflict (username already taken)
 * On not found → 404 (account deleted since token was issued)
 * On any other error → passes to the global error handler via next(err).
 */
export async function updateMeController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id: userId } = (req as unknown as AuthenticatedRequest).user;

    // Zod has already validated and stripped unknown fields.
    const body = req.body as UpdateMeBody;

    const user = await updateMe(userId, body);

    res.status(200).json({
      ok: true,
      data: { user },
    });
  } catch (err) {
    if (err instanceof UsernameConflictError) {
      res.status(409).json({
        ok: false,
        code: "USERNAME_TAKEN",
        message: err.message,
      });
      return;
    }

    if (err instanceof UserNotFoundError) {
      res.status(404).json({
        ok: false,
        code: "USER_NOT_FOUND",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}
