// ============================================================
// 📁 FILE: src/modules/auth/auth.routes.ts
// 🎯 PURPOSE: Mount auth endpoints on an Express Router.
//
// This router is imported once in app.ts and mounted at /api/auth.
// Each route:
//   1. Applies a per-IP rate limiter (5 attempts / 15 min).
//   2. Runs the validate() middleware (schema enforced, for body routes).
//   3. Then calls the controller (pure HTTP plumbing).
// ============================================================

import { Router } from "express";
import { withRateLimit } from "../../middleware/withRateLimit.js";
import { validate } from "../../middleware/validate.js";
import {
  loginLimiter,
  refreshLimiter,
  registerLimiter,
} from "../../utils/rateLimiter.js";
import {
  loginController,
  logoutController,
  refreshController,
  registerController,
} from "./auth.controller.js";
import { LoginBodySchema, RegisterBodySchema } from "./auth.schemas.js";

const router = Router();

// ── POST /api/auth/register ───────────────────────────────────
// Rate-limited → schema-validated → register.
router.post(
  "/register",
  withRateLimit(registerLimiter),
  validate({ body: RegisterBodySchema }),
  registerController,
);

// ── POST /api/auth/login ──────────────────────────────────────
// Rate-limited → schema-validated → login.
router.post(
  "/login",
  withRateLimit(loginLimiter),
  validate({ body: LoginBodySchema }),
  loginController,
);

// ── POST /api/auth/refresh ────────────────────────────────────
// Rate-limited → refresh (reads HttpOnly cookie, rotates token pair).
router.post(
  "/refresh",
  withRateLimit(refreshLimiter),
  refreshController,
);

// ── POST /api/auth/logout ─────────────────────────────────────
// No rate limit needed — logging out is always safe to allow.
// Reads HttpOnly cookie, revokes DB row, clears cookie.
router.post("/logout", logoutController);

export default router;
