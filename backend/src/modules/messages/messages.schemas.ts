// ============================================================
// 📁 FILE: src/modules/messages/messages.schemas.ts
// 🎯 PURPOSE: Zod schemas and inferred TypeScript types for the
//    messages module.
//
// Two endpoints are covered:
//   GET  /api/conversations/:id/messages  — cursor-paginated history
//   POST /api/conversations/:id/read      — bulk mark-as-read
//
// Response shapes mirror exactly what the service returns so every
// controller can use z.infer<> types without importing Prisma types.
// ============================================================

import { z } from "zod";
import { PublicUserSchema } from "../auth/auth.schemas.js";

// ─── Route params ────────────────────────────────────────────
// Shared by both endpoints: the conversation id in the URL path.

export const ConversationParamsSchema = z.object({
  /** UUID of the conversation, taken from the URL. */
  id: z.string().uuid("Conversation id must be a valid UUID"),
});

export type ConversationParams = z.infer<typeof ConversationParamsSchema>;

// ─── GET /api/conversations/:id/messages — query params ──────

/**
 * Cursor-pagination query params.
 *
 * Rules (documented in context.txt §2.3 item 3 and §6.5):
 *  • cursor   — opaque ISO-8601 datetime string of the *oldest* message the
 *               client currently has.  Omit on first load.
 *  • limit    — how many messages to return.  Default 50, hard cap 100.
 *               The service internally fetches limit+1 to detect hasMore.
 */
export const GetMessagesQuerySchema = z.object({
  cursor: z
    .string()
    .datetime({ message: "cursor must be an ISO-8601 datetime string" })
    .optional(),

  limit: z
    .string()
    .optional()
    .transform((val) => (val !== undefined ? parseInt(val, 10) : 50))
    .pipe(
      z
        .number()
        .int("limit must be an integer")
        .min(1, "limit must be at least 1")
        .max(100, "limit cannot exceed 100"),
    ),
});

export type GetMessagesQuery = z.infer<typeof GetMessagesQuerySchema>;

// ─── POST /api/conversations/:id/read — request body ─────────

/**
 * Body for the REST mark-as-read endpoint.
 *
 * `lastReadMessageId` is the client-generated UUID of the newest message
 * the current user has actually seen.  The service creates Receipt rows for
 * ALL messages up to and including that ID that don't already have one.
 */
export const MarkReadBodySchema = z.object({
  lastReadMessageId: z
    .string()
    .uuid("lastReadMessageId must be a valid UUID"),
});

export type MarkReadBody = z.infer<typeof MarkReadBodySchema>;

// ─── DELETE /api/messages/:messageId & PATCH /api/messages/:messageId ────────

/**
 * Route params for single-message endpoints (delete / edit).
 */
export const MessageParamsSchema = z.object({
  messageId: z.string().uuid("messageId must be a valid UUID"),
});

export type MessageParams = z.infer<typeof MessageParamsSchema>;

/**
 * Body for PATCH /api/messages/:messageId — edit the text of a message.
 * The service enforces that the message must already have a textBody
 * (attachment-only messages cannot be edited this way).
 */
export const EditMessageBodySchema = z.object({
  textBody: z.string().min(1, "textBody cannot be empty"),
});

export type EditMessageBody = z.infer<typeof EditMessageBodySchema>;

// ─── Response shapes ─────────────────────────────────────────
// These are NOT used for incoming validation — they document what the
// service layer returns so callers have proper TypeScript types.

/**
 * A single receipt summary row embedded inside a message response.
 * Tells the client which users have read the message and when.
 */
export const ReceiptSummarySchema = z.object({
  userId: z.string().uuid(),
  readTime: z.date(),
});

export type ReceiptSummary = z.infer<typeof ReceiptSummarySchema>;

/**
 * A message as returned to the client.
 *
 * Design notes (context.txt §2.3):
 *  • id is CLIENT-GENERATED — never change this to server-generated.
 *  • Soft-deleted messages: deletedAt is non-null; textBody replaced with
 *    a placeholder by the service — the schema still carries both fields.
 *  • Edited messages carry the current textBody + a non-null editedAt.
 *  • sender is the canonical PublicUser shape — no email, no passwordHash.
 */
export const MessageWithSenderSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  textBody: z.string().nullable(),
  attachmentAddress: z.string().url().nullable(),
  /** SENT | DELIVERED | READ */
  status: z.enum(["SENT", "DELIVERED", "READ"]),
  createdAt: z.date(),
  editedAt: z.date().nullable(),
  /** Non-null means the message was soft-deleted. */
  deletedAt: z.date().nullable(),
  sender: PublicUserSchema,
  receipts: z.array(ReceiptSummarySchema),
});

export type MessageWithSender = z.infer<typeof MessageWithSenderSchema>;

/**
 * Paginated response envelope for GET /api/conversations/:id/messages.
 *
 * Cursor strategy (context.txt §6.5):
 *  • DB returns rows newest-first; client reverses to show oldest at top.
 *  • nextCursor is the createdAt of the OLDEST message in this batch.
 *    Pass it back on the next request to load earlier messages.
 *  • hasMore = false when the service found ≤ limit rows (no extra row).
 */
export const PaginatedMessagesSchema = z.object({
  messages: z.array(MessageWithSenderSchema),
  nextCursor: z
    .string()
    .datetime()
    .nullable()
    .describe(
      "ISO-8601 createdAt of the oldest message in this page; null when hasMore is false",
    ),
  hasMore: z.boolean(),
});

export type PaginatedMessages = z.infer<typeof PaginatedMessagesSchema>;

// ─── POST /api/conversations/:id/messages — request body ─────

/**
 * Body for sending a new message.
 *
 * Rules (mirrors the service guard in sendMessage()):
 *  • textBody    — the text content; optional, trimmed, must be non-empty when present.
 *  • attachments — filenames of files the client already has signed-upload URLs for
 *                  (obtained via POST /api/uploads/sign). The service calls
 *                  signUploadService for each one to resolve the permanent Cloudinary
 *                  public URLs before persisting the Message row.
 *  • At least one of textBody or attachments must be present — a completely empty
 *    message is rejected.
 */
export const SendMessageBodySchema = z
  .object({
    textBody: z
      .string()
      .trim()
      .min(1, "textBody cannot be empty")
      .optional(),

    attachments: z
      .array(z.string().min(1, "attachment filename cannot be empty"))
      .min(1, "attachments array must not be empty when provided")
      .optional(),
  })
  .refine(
    (data) => data.textBody !== undefined || (data.attachments?.length ?? 0) > 0,
    { message: "A message must have a textBody, at least one attachment, or both" },
  );

export type SendMessageBody = z.infer<typeof SendMessageBodySchema>;
