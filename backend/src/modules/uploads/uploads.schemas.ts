// ============================================================
// 📁 FILE: src/modules/uploads/uploads.schemas.ts
// 🎯 PURPOSE: Zod schemas for the presigned file-upload signing
//    endpoint (POST /api/uploads/sign).
//
// Only INPUT and OUTPUT shapes live here. No business logic,
// no signing, no DB access — that is all in uploads.service.ts.
//
// Architecture rule (from context.txt §6.1):
//   *.schemas.ts → Zod schemas for inputs and output shapes.
// ============================================================

import { z } from "zod";

// ─── Allow-list of accepted MIME types ──────────────────────
// Defined here so the service can import and reference the same
// set without introducing magic strings elsewhere.
// (context_upload_files.txt §11.2: "Define an explicit allow-list
//  of MIME types.")
export const ALLOWED_UPLOAD_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

// ─── Upload size limit ───────────────────────────────────────
// 10 MB — mirrored in uploads.service.ts via the same constant.
// (context_upload_files.txt §11.2: "Maximum file size, e.g. 10 MB")
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 485 760 bytes

// ─── Input schema ────────────────────────────────────────────
/**
 * POST /api/uploads/sign — request body schema.
 *
 * Fields (all required — context_upload_files.txt §11.2):
 *  • fileName       — original filename (non-empty string)
 *  • fileType       — MIME type; must be in the explicit allow-list
 *  • fileSize       — byte count; must be a positive integer ≤ MAX_UPLOAD_BYTES
 *  • conversationId — UUID of the conversation the file belongs to;
 *                     used to build the storage path and to verify
 *                     that the requesting user is a participant
 *
 * Validation intentionally happens at the schema layer so that the
 * service receives a fully-typed, already-sanitised value.
 */
export const SignUploadBodySchema = z.object({
  userId: z
    .string()
    .uuid("userId must be a valid UUID"),

  fileName: z
    .string()
    .trim()
    .min(1, "File name is required")
    .max(255, "File name must not exceed 255 characters"),

  fileType: z
    .string()
    .trim()
    .min(1, "File type is required")
    .refine(
      (value): value is AllowedUploadType =>
        (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(value),
      {
        message: `File type not allowed. Accepted types: ${ALLOWED_UPLOAD_TYPES.join(", ")}`,
      },
    ),

  fileSize: z
    .number()
    .int("File size must be an integer")
    .positive("File size must be greater than 0")
    .max(
      MAX_UPLOAD_BYTES,
      `File size must not exceed ${MAX_UPLOAD_BYTES} bytes (10 MB)`,
    ),

  conversationId: z
    .string()
    .uuid("conversationId must be a valid UUID"),
});

export type SignUploadBody = z.infer<typeof SignUploadBodySchema>;

// ─── Output schema ───────────────────────────────────────────
/**
 * Shape returned by POST /api/uploads/sign on success.
 *
 * Fields:
 *  • uploadUrl  — the Cloudinary endpoint the browser POSTs the file to directly
 *                 (never goes through our server)
 *  • publicUrl  — the permanent public URL the file WILL have once uploaded;
 *                 stored in Message.attachmentAddress after a successful upload
 *  • expiresAt  — ISO-8601 string; the signature is only valid for UPLOAD_URL_TTL_SECONDS;
 *                 clients must complete the upload before this time
 *
 * Cloudinary signed-upload params (all required by Cloudinary's API):
 *  • signature  — HMAC-SHA1 of (timestamp + folder + public_id) signed with api_secret;
 *                 generated server-side — api_secret is NEVER returned
 *  • timestamp  — Unix epoch seconds used when generating the signature;
 *                 Cloudinary rejects requests where |now − timestamp| > 1 hour
 *  • apiKey     — Cloudinary public identifier (safe to expose; useless without signature)
 *  • folder     — storage path the file will be placed under (must match what was signed)
 *  • publicId   — unique file identifier within the folder (must match what was signed)
 */
export const SignUploadResponseSchema = z.object({
  uploadUrl: z
    .string()
    .url("uploadUrl must be a valid URL"),

  publicUrl: z
    .string()
    .url("publicUrl must be a valid URL"),

  expiresAt: z
    .string()
    .datetime("expiresAt must be a valid ISO-8601 datetime string"),

  signature: z
    .string()
    .min(1, "signature is required"),

  timestamp: z
    .number()
    .int("timestamp must be an integer")
    .positive("timestamp must be a positive Unix epoch value"),

  apiKey: z
    .string()
    .min(1, "apiKey is required"),

  folder: z
    .string()
    .min(1, "folder is required"),

  publicId: z
    .string()
    .min(1, "publicId is required"),
});

export type SignUploadResponse = z.infer<typeof SignUploadResponseSchema>;
