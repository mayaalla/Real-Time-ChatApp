// ============================================================
// 📁 FILE: src/modules/auth/auth.schemas.ts
// 🎯 PURPOSE: Zod schemas for auth endpoints + the single
//    canonical "public user" shape used everywhere in the API.
//
// Rule: If you need to return user data to a client, pick fields
// from PublicUser. Never reach into the full Prisma User model.
// ============================================================

import { z } from "zod";

// ─── Canonical public user shape ────────────────────────────
// Defined once here and re-exported. Every endpoint that returns
// a user (register, login, /me, profile, etc.) uses this type.
//
// Fields chosen deliberately:
//   id           — stable opaque identifier (UUID)
//   username     — public handle, safe to display anywhere
//   avatarAddress — nullable URL; clients show a placeholder when null
//   lastSeen     — nullable datetime; null = never logged in after signup
//
// Intentionally excluded: email (private), passwordHash (secret),
// name (we keep it internal for now), createdAt (not needed by clients).

export const PublicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  avatarAddress: z.string().nullable(),
  lastSeen: z.date().nullable(),
});

/** The safe user shape returned to clients. Never add passwordHash here. */
export type PublicUser = z.infer<typeof PublicUserSchema>;

// ─── Register ────────────────────────────────────────────────

/**
 * POST /api/auth/register — request body schema.
 *
 * Validation rules (decided once, enforced by Zod):
 *  • email      — must be a valid e-mail address (Zod normalises it to lowercase)
 *  • username   — 3–20 chars, only letters / digits / dot / underscore
 *  • password   — at least 8 chars (bcrypt handles the actual complexity)
 */
export const RegisterBodySchema = z.object({
  // Zod v4: required_error was removed — use .min(1) for the "required" message.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Email is required")
    .email("Must be a valid email address"),

  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(
      /^[a-zA-Z0-9._]+$/,
      "Username may only contain letters, numbers, dots and underscores",
    ),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters (required)"),
});

export type RegisterBody = z.infer<typeof RegisterBodySchema>;

// ─── Login ───────────────────────────────────────────────────

/**
 * POST /api/auth/login — request body schema.
 *
 * Accepts either `email` OR `username` (or both) together with `password`.
 * At least one of the two identifier fields must be present.
 *
 * Security note: we intentionally do NOT indicate *which* field failed
 * in the HTTP 401 response — that lives in the service/controller layer.
 * Here we only enforce structural validity.
 */
export const LoginBodySchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Must be a valid email address")
      .optional(),

    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(20, "Username must be at most 20 characters")
      .optional(),

    password: z.string().min(1, "Password is required"),
  })
  .superRefine((data, ctx) => {
    if (!data.email && !data.username) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["email"],
        message: "Provide either an email address or a username",
      });
    }
  });

export type LoginBody = z.infer<typeof LoginBodySchema>;
