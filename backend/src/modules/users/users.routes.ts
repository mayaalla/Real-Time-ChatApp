// ============================================================
// 📁 FILE: src/modules/users/users.routes.ts
// 🎯 PURPOSE: Mount user endpoints on an Express Router.
//
// This router is imported in app.ts and mounted at /api/users.
//
// Every route here is protected by `authenticate` — no unauthenticated
// access to any user data. The guard runs before validate() so a bad
// token always gets a 401 (not a 400 about missing fields).
//
// Route summary:
//   GET  /api/users/me        → who am I?  (Step 8.1 — DONE)
//   GET  /api/users?search=   → find users (Step 8.2 — DONE)
//   PATCH /api/users/me       → edit my profile (Step 8.3 — DONE)
// ============================================================

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  getMeController,
  searchUsersController,
  updateMeController,
} from "./users.controller.js";
import {
  SearchQuerySchema,
  UpdateMeBodySchema,
} from "./users.schemas.js";

const router = Router();

// Apply `authenticate` to the ENTIRE router.
// Every route below requires a valid access token.
// A missing / expired / invalid token → 401 before any handler runs.
router.use(authenticate);

// ── GET /api/users/me ─────────────────────────────────────────
// Returns the authenticated user's public profile.
// No body / params / query to validate — identity comes from the token.
// The frontend calls this on every page load to restore the session.
router.get("/me", getMeController);

// ── GET /api/users?search= ────────────────────────────────────
// Case-insensitive prefix search on usernames.
// validate() ensures `search` is present and has ≥2 characters before
// hitting the controller — avoids unbounded wildcard queries.
router.get(
  "/",
  validate({ query: SearchQuerySchema }),
  searchUsersController,
);

// ── PATCH /api/users/me ───────────────────────────────────────
// Partial update: username and/or avatarAddress.
// All fields are optional — an empty body is a valid (no-op) request.
router.patch(
  "/me",
  validate({ body: UpdateMeBodySchema }),
  updateMeController,
);

export default router;
