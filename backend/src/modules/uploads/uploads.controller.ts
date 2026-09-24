// ============================================================
// 📁 FILE: src/modules/uploads/uploads.controller.ts
// 🎯 PURPOSE: HTTP layer for upload-related routes — thin wrapper only.
//
// Controllers do exactly three things:
//   1. Pull validated data off req (params / query / body).
//   2. Call the service.
//   3. Map the result (or error) to an HTTP response.
//
// No database calls, no business logic — those live in uploads.service.ts.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../types/express.js";
import type { SignUploadBody } from "./uploads.schemas.js";
import {
  signUploadService,
  NotAllowedToUpload,
  NotAllowed,
  NotFound,
} from "./uploads.service.js";

// ─── POST /api/uploads/sign ──────────────────────────────────

/**
 * Generate a Cloudinary signed-upload token for a single file.
 *
 * The client calls this endpoint BEFORE uploading a file. The server:
 *   1. Verifies the conversation exists.
 *   2. Verifies the caller is a participant of that conversation.
 *   3. Validates the MIME type and byte-size against the allow-list.
 *   4. Signs a Cloudinary upload request and returns the params the
 *      browser needs to POST the file directly to Cloudinary — the
 *      raw file bytes never touch our server.
 *
 * Body: { userId, fileName, fileType, fileSize, conversationId }
 *   — All fields are validated by Zod before this controller runs.
 *   — `userId` in the body is used by the service for the path + auth check.
 *     The authenticated user id (req.user.id) is the authoritative identity;
 *     it must match body.userId — enforced by the service's participant check.
 *
 * On success → 200 { ok: true, data: { uploadUrl, publicUrl, expiresAt,
 *                                      signature, timestamp, apiKey,
 *                                      folder, publicId } }
 * On 400     → file type or size not allowed.
 * On 403     → caller is not a participant of the conversation.
 * On 404     → conversation not found.
 * Anything else is forwarded to the global error handler.
 */
export async function signUploadController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as unknown as AuthenticatedRequest;

    // Zod has already validated + stripped the body; cast is safe.
    const body = req.body as SignUploadBody;

    // Override userId with the token owner — prevents a user from
    // signing an upload on behalf of someone else.
    const payload: SignUploadBody = {
      ...body,
      userId: authReq.user.id,
    };

    const data = await signUploadService(payload);

    res.status(200).json({ ok: true, data });
  } catch (err) {
    if (err instanceof NotFound) {
      res.status(404).json({
        ok: false,
        code: "NOT_FOUND",
        message: err.message,
      });
      return;
    }

    if (err instanceof NotAllowed) {
      res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: err.message,
      });
      return;
    }

    if (err instanceof NotAllowedToUpload) {
      res.status(400).json({
        ok: false,
        code: "UPLOAD_NOT_ALLOWED",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}
