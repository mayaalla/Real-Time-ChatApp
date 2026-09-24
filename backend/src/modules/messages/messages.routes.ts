// ============================================================
// 📁 FILE: src/modules/messages/messages.routes.ts
// 🎯 PURPOSE: Wire message-related endpoints onto an Express Router.
//
// Mounted at /api/conversations (app.ts) so the full paths become:
//   GET  /api/conversations/:id/messages
//   POST /api/conversations/:id/read
//
// Every route:
//   1. Runs authenticate middleware  — rejects unauthenticated callers.
//   2. Runs validate()              — parses & coerces params/query/body
//                                     using the Zod schemas from .schemas.ts.
//   3. Calls the controller         — pure HTTP plumbing, no logic here.
// ============================================================

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  ConversationParamsSchema,
  GetMessagesQuerySchema,
  MarkReadBodySchema,
  MessageParamsSchema,
  EditMessageBodySchema,
} from "./messages.schemas.js";
import {
  getMessagesController,
  markReadController,
  deleteMessageController,
  editMessageController,
} from "./messages.controller.js";

const router = Router();

// ── GET /api/conversations/:id/messages ──────────────────────
// Returns cursor-paginated message history for a conversation.
//
// Auth:   Bearer token required (authenticate middleware).
// Params: { id }           — conversation UUID (validated).
// Query:  { cursor?, limit } — cursor = ISO-8601 createdAt of the oldest
//                              message the client has; limit 1-100.
//
// Response: { ok: true, data: { messages[], nextCursor, hasMore } }
router.get(
  "/:id/messages",
  authenticate,
  validate({
    params: ConversationParamsSchema,
    query: GetMessagesQuerySchema,
  }),
  getMessagesController,
);

// ── POST /api/conversations/:id/read ─────────────────────────
// Bulk marks messages as read up to and including lastReadMessageId.
//
// Auth:   Bearer token required (authenticate middleware).
// Params: { id }                    — conversation UUID (validated).
// Body:   { lastReadMessageId }     — UUID of the last seen message.
//
// Response: { ok: true, data: { markedCount } }
router.post(
  "/:id/read",
  authenticate,
  validate({
    params: ConversationParamsSchema,
    body: MarkReadBodySchema,
  }),
  markReadController,
);

// ── DELETE /api/messages/:messageId ──────────────────────────
// Soft-deletes a message owned by the caller (sets deletedAt).
// Only the original sender can delete their own message.
//
// Auth:   Bearer token required.
// Params: { messageId } — UUID of the message to delete.
//
// Response: { ok: true, data: { message } }
router.delete(
  "/messages/:messageId",
  authenticate,
  validate({ params: MessageParamsSchema }),
  deleteMessageController,
);

// ── PATCH /api/messages/:messageId ───────────────────────────
// Edits the textBody of a message owned by the caller (sets editedAt).
// Attachment-only messages (no textBody) are rejected by the service.
//
// Auth:   Bearer token required.
// Params: { messageId } — UUID of the message to edit.
// Body:   { textBody }  — the replacement text (non-empty string).
//
// Response: { ok: true, data: { message } }
router.patch(
  "/messages/:messageId",
  authenticate,
  validate({
    params: MessageParamsSchema,
    body: EditMessageBodySchema,
  }),
  editMessageController,
);

export default router;
