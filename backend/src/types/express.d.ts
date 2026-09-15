// ============================================================
// 📁 FILE: src/types/express.d.ts
// 🎯 PURPOSE: Single source of truth for the "authenticated request" type.
//
// ⚠️  RULE — READ BEFORE TOUCHING THIS FILE:
//    This project uses the **AuthenticatedRequest** interface pattern.
//    We do NOT augment Express's global Request via "declare global".
//    See docs/auth-request-typing.md for the full decision record.
//
// Usage in a protected route handler:
//   import type { AuthenticatedRequest } from "../../types/express.js";
//   (req: AuthenticatedRequest, res: Response) => { req.user.id ... }
// ============================================================

/**
 * Minimal shape of the user that is attached to the request after the
 * `authenticate` middleware runs successfully.
 *
 * We expose only the fields that downstream route handlers actually need —
 * not the full Prisma `User` model — so we never accidentally leak
 * passwordHash or other sensitive columns into handler code.
 */
export interface RequestUser {
  /** The UUID primary key from the `User` table. */
  id: string;
  /** The user's display e-mail address. */
  email: string;
  /** The user's unique handle (e.g. "@maya"). */
  username: string;
}

/**
 * An Express request that has been verified by the `authenticate` middleware.
 *
 * Use this type — instead of the bare Express `Request` — in every route
 * handler that sits behind the auth guard.  TypeScript will then guarantee
 * that `req.user` is present and fully typed.
 *
 * Example:
 *   router.get("/me", authenticate, (req: AuthenticatedRequest, res) => {
 *     res.json({ id: req.user.id });
 *   });
 */
export interface AuthenticatedRequest extends Express.Request {
  /** The verified, decoded token payload attached by `authenticate`. */
  user: RequestUser;
}
