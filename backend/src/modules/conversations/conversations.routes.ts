// ============================================================
// 📁 FILE: src/modules/conversations/conversations.routes.ts
// 🎯 PURPOSE: Wire URL paths → middleware → controller handlers.
//
// Part 9 — Conversations REST API
//
// Pattern (identical to auth.routes.ts):
//   routes  → validate  → authenticate  → controller
//
// All routes are PROTECTED — every request must carry a valid
// Bearer access token (checked by the `authenticate` middleware).
//
// Routes are commented out until the controller is implemented.
// To activate a route:
//   1. Uncomment the import for its controller handler.
//   2. Uncomment the route line itself.
//
// Mount point (in app.ts):
//   app.use("/api/conversations", conversationsRouter);
// ============================================================

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  CreateConversationBodySchema,
  ConversationParamsSchema,
} from "./conversations.schemas.js";

// ─── Controller imports (uncomment each when the handler is written) ──────────
//
// import {
//   createConversationController,
//   listConversationsController,
//   getConversationController,
// } from "./conversations.controller.js";
//
// Optional v1 controllers (Part 9.4):
// import {
//   addParticipantController,
//   removeParticipantController,
//   updateConversationController,
// } from "./conversations.controller.js";

const router = Router();

// All routes in this module require a valid access token.
router.use(authenticate);

// ─── POST /api/conversations ─────────────────────────────────────────────────
// Create a new DM or group conversation.
//
// Body: { participantIds: string[], isGroup: boolean, name?: string }
//
// Rules enforced by schema + service:
//   • DM:    exactly 1 other participant, no name, idempotent (return existing)
//   • Group: 2+ other participants, name required
//   • Creator is always added as OWNER role
//   • All listed userIds must exist in the DB
//   • Created in a single DB transaction
//
// Response: 201 { ok: true, data: ConversationDetail }
//
// router.post(
//   "/",
//   validate({ body: CreateConversationBodySchema }),
//   createConversationController,
// );

// ─── GET /api/conversations ───────────────────────────────────────────────────
// List all conversations the authenticated user belongs to.
//
// Returns per conversation: id, isGroup, displayName, displayPicture,
//   participants, lastMessage (preview), unreadCount.
//
// Sorted by last message time DESC; conversations with no messages
//   are sorted by createdAt DESC.
//
// ⚠️  N+1 RULE: last messages and unread counts must be fetched in
//   batched/grouped queries — NEVER inside a per-conversation loop.
//
// Response: 200 { ok: true, data: ConversationSummary[] }
//
// router.get(
//   "/",
//   listConversationsController,
// );

// ─── GET /api/conversations/:id ──────────────────────────────────────────────
// Fetch a single conversation by ID.
//
// Membership is checked FIRST (isParticipant() shared function).
// Returns 403 (or 404 to hide existence) if the caller is not a member.
//
// Response: 200 { ok: true, data: ConversationDetail }
//
// router.get(
//   "/:id",
//   validate({ params: ConversationParamsSchema }),
//   getConversationController,
// );

// ─── POST /api/conversations/:id/participants  (optional v1 — Part 9.4) ──────
// Add a new member to a group conversation.
// Requires OWNER or ADMIN role.
//
// Body: { userId: string }
//
// Response: 200 { ok: true, data: ConversationDetail }
//
// router.post(
//   "/:id/participants",
//   validate({ params: ConversationParamsSchema }),
//   addParticipantController,
// );

// ─── DELETE /api/conversations/:id/participants/:userId  (optional v1) ────────
// Remove a participant, or leave the conversation yourself.
// OWNER can remove anyone. ADMIN can remove MEMBERs. Any member can remove self.
//
// Response: 204 No Content
//
// router.delete(
//   "/:id/participants/:userId",
//   validate({ params: ConversationParamsSchema }),
//   removeParticipantController,
// );

// ─── PATCH /api/conversations/:id  (optional v1 — Part 9.4) ──────────────────
// Rename a group conversation.
// Requires OWNER or ADMIN role.
//
// Body: { name: string }
//
// Response: 200 { ok: true, data: ConversationDetail }
//
// router.patch(
//   "/:id",
//   validate({ params: ConversationParamsSchema }),
//   updateConversationController,
// );

export { router as conversationsRouter };
