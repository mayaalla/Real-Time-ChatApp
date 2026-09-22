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
//
// NOTE TO REVIEWER: Routes are commented out until the controller file
// is implemented (messages.controller.ts is currently a stub).
// Remove the block-comment delimiters once the controller is ready.
// ============================================================

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  ConversationParamsSchema,
  GetMessagesQuerySchema,
  MarkReadBodySchema,
} from "./messages.schemas.js";

// Uncomment this import once messages.controller.ts is implemented:
// import {
//   getMessagesController,
//   markReadController,
// } from "./messages.controller.js";

const router = Router();

// ── GET /api/conversations/:id/messages ──────────────────────
// Returns cursor-paginated message history for a conversation.
//
// Auth:   Bearer token required (authenticate middleware).
// Params: { id }           — conversation UUID (validated).
// Query:  { cursor?, limit } — cursor = ISO-8601 createdAt of oldest
//                              message the client has; limit 1-100.
//
// Response: { ok: true, data: { messages[], nextCursor, hasMore } }
//
// The controller must:
//   1. Verify the caller is a participant (via shared isParticipant()).
//   2. Delegate to messagesService.getMessages().
//   3. Return 200 with the PaginatedMessages shape.
//
/*
router.get(
  "/:id/messages",
  authenticate,
  validate({
    params: ConversationParamsSchema,
    query: GetMessagesQuerySchema,
  }),
  getMessagesController,
);
*/

// ── POST /api/conversations/:id/read ─────────────────────────
// Bulk marks messages as read up to and including lastReadMessageId.
//
// Auth:   Bearer token required (authenticate middleware).
// Params: { id }                    — conversation UUID (validated).
// Body:   { lastReadMessageId }     — UUID of the last seen message.
//
// Response: { ok: true, data: null }  (204-style, body for consistency)
//
// The controller must:
//   1. Verify the caller is a participant (via shared isParticipant()).
//   2. Delegate to messagesService.markRead().
//   3. Return 200 (or 204) — this endpoint never 404s on missing receipts.
//
/*
router.post(
  "/:id/read",
  authenticate,
  validate({
    params: ConversationParamsSchema,
    body: MarkReadBodySchema,
  }),
  markReadController,
);
*/

export default router;
