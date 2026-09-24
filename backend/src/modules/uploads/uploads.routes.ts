// ============================================================
// 📁 FILE: src/modules/uploads/uploads.routes.ts
// 🎯 PURPOSE: Wire upload-related endpoints onto an Express Router.
//
// Mounted at /api/uploads (app.ts) so the full paths become:
//   POST /api/uploads/sign
//
// Every route:
//   1. Runs authenticate middleware  — rejects unauthenticated callers.
//   2. Runs validate()              — parses & coerces body using the
//                                     Zod schema from uploads.schemas.ts.
//   3. Calls the controller         — pure HTTP plumbing, no logic here.
// ============================================================

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import { SignUploadBodySchema } from "./uploads.schemas.js";
import { signUploadController } from "./uploads.controller.js";

const router = Router();

// ── POST /api/uploads/sign ───────────────────────────────────
// Returns a Cloudinary signed-upload token the browser uses to POST
// a file directly to Cloudinary — the raw bytes never hit our server.
//
// Auth:   Bearer token required (authenticate middleware).
// Body:   { userId, fileName, fileType, fileSize, conversationId }
//           All fields validated by Zod; fileType must be in the
//           ALLOWED_UPLOAD_TYPES allow-list; fileSize ≤ 10 MB.
//
// Response: { ok: true, data: { uploadUrl, publicUrl, expiresAt,
//                               signature, timestamp, apiKey,
//                               folder, publicId } }
router.post(
  "/sign",
  authenticate,
  validate({ body: SignUploadBodySchema }),
  signUploadController,
);

export default router;