// ============================================================
// 📁 FILE: src/modules/uploads/uploads.routes.ts
// 🎯 PURPOSE: Wire upload-related endpoints onto an Express Router.
//
// Mounted at /api/uploads (app.ts) so the full paths become:
//   POST /api/uploads/sign
//
// Every route:
//   1. Runs authenticate middleware  — rejects unauthenticated callers.
//   2. Runs withRateLimit()         — 10 requests per 60 s per IP to
//                                     protect Cloudinary signed-token quota.
//   3. Runs validate()              — parses & coerces body using the
//                                     Zod schema from uploads.schemas.ts.
//   4. Runs guardUploadOwnership    — asserts req.body.userId === req.user.id
//                                     to prevent token generation for other users.
//   5. Calls the controller         — pure HTTP plumbing, no logic here.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { withRateLimit } from "../../middleware/withRateLimit.js";
import { uploadSignLimiter } from "../../utils/rateLimiter.js";
import { SignUploadBodySchema } from "./uploads.schemas.js";
import { signUploadController } from "./uploads.controller.js";
import type { AuthenticatedRequest } from "../../types/express.js";

const router = Router();

// ─── Ownership guard ──────────────────────────────────────────
//
// The SignUploadBodySchema includes a `userId` field so the client
// can tell the server which user folder to upload into (Cloudinary
// organises files under a per-user public ID prefix).
//
// Without this guard an authenticated user could forge another user's
// userId and generate signed tokens that write into their folder.
//
// This middleware runs AFTER validate() so req.body.userId is already
// a clean, Zod-parsed UUID when we compare it against req.user.id.
//
function guardUploadOwnership(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authenticatedReq = req as unknown as AuthenticatedRequest;
  if (req.body.userId !== authenticatedReq.user.id) {
    res.status(403).json({
      ok: false,
      code: "FORBIDDEN",
      message: "userId in request body does not match the authenticated user.",
    });
    return;
  }
  next();
}

// ── POST /api/uploads/sign ───────────────────────────────────
// Returns a Cloudinary signed-upload token the browser uses to POST
// a file directly to Cloudinary — the raw bytes never hit our server.
//
// Auth:   Bearer token required (authenticate middleware).
// Rate:   10 requests per 60 s per IP (uploadSignLimiter).
// Body:   { userId, fileName, fileType, fileSize, conversationId }
//           All fields validated by Zod; fileType must be in the
//           ALLOWED_UPLOAD_TYPES allow-list; fileSize ≤ 10 MB.
// Guard:  userId must equal req.user.id — no generating tokens for others.
//
// Response: { ok: true, data: { uploadUrl, publicUrl, expiresAt,
//                               signature, timestamp, apiKey,
//                               folder, publicId } }
router.post(
  "/sign",
  authenticate,
  withRateLimit(uploadSignLimiter),
  validate({ body: SignUploadBodySchema }),
  guardUploadOwnership,
  signUploadController,
);

export default router;