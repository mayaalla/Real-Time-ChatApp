// ============================================================
// 📁 FILE: src/modules/users/users.schemas.ts
// 🎯 PURPOSE: Zod schemas for the users module.
//
// Step 8.1 — "Who am I?"
//   GET /api/users/me  returns a PublicUser.
//
// PublicUser is the authoritative safe user shape, defined in
// auth.schemas.ts and re-exported here so routes don't need to
// import across module boundaries for a common type.
// ============================================================

import { z } from "zod";

// ─── Re-export the canonical public user type ────────────────
// Defined once in auth.schemas.ts. We re-export here so callers
// inside the users module have a single, nearby import source.
export { PublicUserSchema, type PublicUser } from "../auth/auth.schemas.js";

// ─── PATCH /api/users/me — update body schema ────────────────
// Optional for v1 (Step 8.3). Defined here now so the schema
// file is never empty and future work just adds more entries.
//
// Allowed fields for self-update:
//   username      — must pass the same rules as registration
//   avatarAddress — any HTTPS URL, or null to clear the avatar
//
// Note: every field is optional (partial patch semantics).
// An empty body is a no-op and returns the unchanged user.

export const UpdateMeBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9._]+$/,
      "Username may only contain letters, numbers, dots and underscores",
    )
    .optional(),

  avatarAddress: z
    .string()
    .url("Must be a valid URL")
    .nullable()
    .optional(),
});

export type UpdateMeBody = z.infer<typeof UpdateMeBodySchema>;

// ─── GET /api/users?search= — query params schema ────────────
// search: at least 2 characters (enforced in service too).

export const SearchQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(2, "Search query must be at least 2 characters"),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;