// ============================================================
// 📁 FILE: src/modules/conversations/conversations.routes.ts
// 🎯 PURPOSE: Mount conversation endpoints on an Express Router.
//
// This router is imported in app.ts and mounted at /api/conversations.
//
// All routes are protected — the `authenticate` middleware runs first
// on every request to this router (router.use(authenticate)).
//
// Route summary:
//   POST   /api/conversations                           → create DM or group
//   GET    /api/conversations                           → list my conversations
//   GET    /api/conversations/:id                       → single conversation detail
//   GET    /api/conversations/:id/participants          → list participants
//   POST   /api/conversations/:id/participants          → add a participant
//   DELETE /api/conversations/:id/participants/:userId  → remove a participant
//   PATCH  /api/conversations/:id                       → rename a group
// ============================================================

import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middleware/authenticate.js";
import { validate } from "../../middleware/validate.js";
import {
  CreateConversationBodySchema,
  ConversationParamsSchema,
} from "./conversations.schemas.js";
import {
  createConversationController,
  getAllConversationsController,
  getConversationController,
  getParticipantsController,
  addParticipantController,
  deleteParticipantController,
  renameGroupController,
} from "./conversations.controller.js";

const router = Router();

// ─── Protect every route in this router ──────────────────────────────────────
//
// All conversation endpoints require a valid access token.
// The `authenticate` middleware verifies the Bearer token in the
// Authorization header and attaches `req.user` before any handler runs.
// If the token is missing or invalid it immediately returns 401.
//
router.use(authenticate);


// ─── Inline Zod schemas for simple request bodies ────────────────────────────
//
// These schemas are small and only used in this file, so they live here
// instead of conversations.schemas.ts to keep that file focused on the
// shapes that are shared across layers (service ↔ controller ↔ tests).

/**
 * Body for POST /api/conversations/:id/participants
 * Adds one user to an existing group conversation.
 */
const AddParticipantBodySchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
});

/**
 * Body for PATCH /api/conversations/:id
 * Renames an existing group conversation.
 */
const RenameGroupBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Group name must not be blank")
    .max(100, "Group name must be at most 100 characters"),
});

/**
 * Path params schema for routes that include :id AND :userId
 * e.g. DELETE /api/conversations/:id/participants/:userId
 */
const ParticipantRouteParamsSchema = z.object({
  id: z.string().uuid("Conversation ID must be a valid UUID"),
  userId: z.string().uuid("Participant ID must be a valid UUID"),
});


// ─── POST /api/conversations ──────────────────────────────────────────────────
//
// Create a new conversation.
//
// Body (validated by CreateConversationBodySchema):
//   { participantIds: string[], isGroup: boolean, name?: string }
//
// The current user is automatically added as OWNER.
// participantIds must NOT include the caller's own ID.
//
// For DMs: if a conversation already exists between these two users,
// the existing one is returned instead of creating a duplicate.
//
router.post(
  "/",
  validate({ body: CreateConversationBodySchema }),
  createConversationController,
);


// ─── GET /api/conversations ───────────────────────────────────────────────────
//
// Return all conversations the authenticated user belongs to.
// Includes: displayName, displayPicture, participants, lastMessage, unreadCount.
// Sorted by most recent activity DESC.
//
router.get(
  "/",
  getAllConversationsController,
);


// ─── GET /api/conversations/:id ───────────────────────────────────────────────
//
// Return a single conversation with full participant list and roles.
// The service checks membership first — non-members receive 404 (not 403)
// to avoid leaking the existence of private conversations.
//
router.get(
  "/:id",
  validate({ params: ConversationParamsSchema }),
  getConversationController,
);


// ─── GET /api/conversations/:id/participants ──────────────────────────────────
//
// Return the full participant list for a conversation (id, role, joinTime, user).
// Useful for group management UIs.
//
router.get(
  "/:id/participants",
  validate({ params: ConversationParamsSchema }),
  getParticipantsController,
);


// ─── POST /api/conversations/:id/participants ─────────────────────────────────
//
// Add a new member to a group conversation.
// Rejected for DMs (which are always exactly 2 people).
// In v1 any authenticated user can call this; restrict to OWNER/ADMIN in v2.
//
router.post(
  "/:id/participants",
  validate({
    params: ConversationParamsSchema,
    body: AddParticipantBodySchema,
  }),
  addParticipantController,
);


// ─── DELETE /api/conversations/:id/participants/:userId ───────────────────────
//
// Remove a participant from a conversation.
// :userId here is the Participant row's own `id` (the join-table PK),
// not the User.id. This matches how deleteParticipent() is defined in
// the service.
//
// In v1 any authenticated user can call this; restrict to OWNER/ADMIN
// (or self-leave) in v2.
//
router.delete(
  "/:id/participants/:userId",
  validate({ params: ParticipantRouteParamsSchema }),
  deleteParticipantController,
);


// ─── PATCH /api/conversations/:id ─────────────────────────────────────────────
//
// Rename a group conversation. Rejected for DMs.
// In v1 any authenticated user can call this; restrict to OWNER/ADMIN in v2.
//
router.patch(
  "/:id",
  validate({
    params: ConversationParamsSchema,
    body: RenameGroupBodySchema,
  }),
  renameGroupController,
);


export default router;
