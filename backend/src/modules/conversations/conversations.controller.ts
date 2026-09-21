// ============================================================
// 📁 FILE: src/modules/conversations/conversations.controller.ts
// 🎯 PURPOSE: HTTP layer for conversation routes — thin wrappers only.
//
// Controllers do exactly three things:
//   1. Pull validated data off req.body / req.params / req.query.
//   2. Call the appropriate service function.
//   3. Map the result (or error) to an HTTP response.
//
// No database calls, no business logic — those live in
// conversations.service.ts.
//
// TYPE STRATEGY:
//   All handlers are declared as standard Express (req: Request, ...) so
//   they satisfy Express's RequestHandler type and can be passed directly
//   to router.get() / router.post() etc. without casts in the routes file.
//
//   To access req.user (set by the authenticate middleware) we extract the
//   user by casting the request the same way authenticate.ts does:
//     const user = (req as unknown as AuthenticatedRequest).user;
//
//   The rest of the time (body, params, etc.) we use req directly since
//   those fields exist on the plain Express Request type.
//
//   This is safe because authenticate middleware always runs first
//   (via router.use(authenticate) in conversations.routes.ts) and guarantees
//   req.user is present before any of these handlers executes.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../types/express.js";
import {
  createConversation,
  getAllConversations,
  getConversation,
  getParticipents,
  addParticipant,
  deleteParticipent,
  renameGroup,
  // Custom errors — each carries a statusCode used below
  DuplicatePrivateConvo,
  DuplicateUser,
  InvalidParticipantCount,
  GroupNameRequired,
  UserNotFoundError,
  ConversationFoundError,
  AddParticipantError,
  RenameError,
} from "./conversations.service.js";
import type {
  CreateConversationBody,
  ConversationParams,
} from "./conversations.schemas.js";


// ─── Tiny helper ─────────────────────────────────────────────────────────────
// Read req.user set by the authenticate middleware.
// Mirrors the cast pattern in authenticate.ts — only done in one place per
// file so it's easy to audit.
function getUser(req: Request) {
  return (req as unknown as AuthenticatedRequest).user;
}


// ─── POST /api/conversations ──────────────────────────────────────────────────

/**
 * Create a new conversation (private DM or group chat).
 *
 * Expects req.body to have been validated against CreateConversationBodySchema
 * by the `validate()` middleware in conversations.routes.ts.
 *
 * The authenticated user (req.user.id) is always added as OWNER and must NOT
 * be included in participantIds.
 *
 * Success scenarios:
 *   201 Created — new conversation created.
 *   201 Created — DM already existed between these two users; returns it
 *                 instead of creating a duplicate (idempotency rule).
 *
 * Error scenarios:
 *   400 Bad Request — wrong participant count, missing group name, or
 *                     duplicate user IDs in the request body.
 *   404 Not Found   — one or more participantIds do not exist in the DB.
 *   409 Conflict    — duplicate user IDs in participantIds list.
 */
export async function createConversationController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = req.body as CreateConversationBody;
    const creatorId = getUser(req).id;

    const conversation = await createConversation(body, creatorId);

    // 201 for both new and pre-existing DM (idempotency: service returns the
    // existing DM instead of creating a duplicate, client handles gracefully).
    res.status(201).json({
      ok: true,
      data: { conversation },
    });
  } catch (err) {
    if (err instanceof DuplicateUser) {
      res.status(409).json({
        ok: false,
        code: "DUPLICATE_USER",
        message: err.message,
      });
      return;
    }

    if (err instanceof InvalidParticipantCount) {
      res.status(400).json({
        ok: false,
        code: "INVALID_PARTICIPANT_COUNT",
        message: err.message,
      });
      return;
    }

    if (err instanceof GroupNameRequired) {
      res.status(400).json({
        ok: false,
        code: "GROUP_NAME_REQUIRED",
        message: err.message,
      });
      return;
    }

    if (err instanceof UserNotFoundError) {
      res.status(404).json({
        ok: false,
        code: "USER_NOT_FOUND",
        message: err.message,
      });
      return;
    }

    if (err instanceof DuplicatePrivateConvo) {
      res.status(409).json({
        ok: false,
        code: "DUPLICATE_CONVERSATION",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}


// ─── GET /api/conversations ───────────────────────────────────────────────────

/**
 * Return all conversations the authenticated user belongs to.
 *
 * Each item in the list includes:
 *   id, isGroup, displayName, displayPicture, participants,
 *   lastMessage (preview), unreadCount, createdAt
 *
 * Sorted by last activity (most recent message / creation time) DESC.
 * Unread counts are fetched in a single grouped query — no N+1.
 *
 * Success: 200 OK with { ok: true, data: { conversations: ConversationSummary[] } }
 */
export async function getAllConversationsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const currentUserId = getUser(req).id;

    const conversations = await getAllConversations(currentUserId);

    res.status(200).json({
      ok: true,
      data: { conversations },
    });
  } catch (err) {
    next(err);
  }
}


// ─── GET /api/conversations/:id ───────────────────────────────────────────────

/**
 * Return a single conversation with the full participant list and roles.
 *
 * Membership is verified FIRST inside the service (isParticipant guard).
 * If the calling user is not a member, the service throws ConversationFoundError
 * and we respond with 404 to avoid leaking the existence of the conversation.
 *
 * Path param: id — validated as UUID by ConversationParamsSchema in routes.
 *
 * Success: 200 OK with { ok: true, data: { conversation: ConversationDetail } }
 * Error:   404 if not found or user is not a member.
 */
export async function getConversationController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ConversationParams;
    const currentUserId = getUser(req).id;

    const conversation = await getConversation(id, currentUserId);

    res.status(200).json({
      ok: true,
      data: { conversation },
    });
  } catch (err) {
    if (err instanceof ConversationFoundError) {
      res.status(404).json({
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        // Intentionally generic — do NOT reveal whether the conversation
        // exists but the user is not a member, or simply doesn't exist at all.
        message: "Conversation not found.",
      });
      return;
    }

    next(err);
  }
}


// ─── GET /api/conversations/:id/participants ──────────────────────────────────

/**
 * Return the full participant list for a conversation.
 *
 * The service throws ConversationFoundError (404) when the conversation
 * has no participants (i.e. it doesn't exist or has been emptied).
 *
 * Path param: id — validated as UUID by ConversationParamsSchema in routes.
 *
 * Success: 200 OK with { ok: true, data: { participants: Participant[] } }
 * Error:   404 if conversation not found.
 */
export async function getParticipantsController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ConversationParams;

    const participants = await getParticipents(id);

    res.status(200).json({
      ok: true,
      data: { participants },
    });
  } catch (err) {
    if (err instanceof ConversationFoundError) {
      res.status(404).json({
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
      });
      return;
    }

    next(err);
  }
}


// ─── POST /api/conversations/:id/participants ─────────────────────────────────

/**
 * Add a new member to a group conversation.
 *
 * Rules (enforced in the service):
 *   • The conversation must exist.
 *   • Only group conversations accept new members (DMs are always 2 people).
 *   • The target user must exist in the database.
 *   • The target user must not already be a participant.
 *
 * Body: { userId: string } — the UUID of the user to add.
 *
 * In v1 the route is accessible by any authenticated user who knows the
 * conversationId. A future iteration should restrict this to OWNER/ADMIN only.
 *
 * Success: 201 Created with { ok: true, data: { participant: Participant } }
 * Errors:
 *   400 — cannot add to a DM, or user is already a member.
 *   404 — conversation or user not found.
 */
export async function addParticipantController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ConversationParams;
    // userId comes from the validated request body
    const userId = req.body.userId as string;

    const participant = await addParticipant(id, userId);

    res.status(201).json({
      ok: true,
      data: { participant },
    });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      res.status(404).json({
        ok: false,
        code: "USER_NOT_FOUND",
        message: err.message,
      });
      return;
    }

    if (err instanceof ConversationFoundError) {
      res.status(404).json({
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
      });
      return;
    }

    if (err instanceof AddParticipantError) {
      res.status(400).json({
        ok: false,
        code: "ADD_PARTICIPANT_ERROR",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}


// ─── DELETE /api/conversations/:id/participants/:userId ───────────────────────

/**
 * Remove a participant from a conversation (kick or self-leave).
 *
 * Path params:
 *   id     — conversation UUID (validated by ConversationParamsSchema)
 *   userId — the Participant join-table row `id` (its UUID primary key),
 *            NOT the User.id. This matches the deleteParticipent() service
 *            signature which looks up by participant.id.
 *
 * In v1 the route is accessible by any authenticated user. A future iteration
 * should restrict removal to OWNER/ADMIN or the participant themselves.
 *
 * Success: 200 OK with { ok: true, data: { message: string } }
 * Error:   404 if the participant record doesn't exist.
 */
export async function deleteParticipantController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ConversationParams;
    // `:userId` in the URL maps to the Participant row's own `id` field.
    const participantId = req.params["userId"] as string;

    const result = await deleteParticipent(id, participantId);

    res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (err) {
    if (err instanceof ConversationFoundError) {
      res.status(404).json({
        ok: false,
        code: "PARTICIPANT_NOT_FOUND",
        message: "Participant not found in this conversation.",
      });
      return;
    }

    next(err);
  }
}


// ─── PATCH /api/conversations/:id ─────────────────────────────────────────────

/**
 * Rename a group conversation.
 *
 * Only group conversations can be renamed — the service throws RenameError
 * (400) when called on a DM.
 *
 * Body: { name: string } — the new display name (non-empty, max 100 chars).
 *
 * In v1 the route is accessible by any authenticated user who knows the
 * conversationId. A future iteration should restrict this to OWNER/ADMIN.
 *
 * Success: 200 OK with { ok: true, data: { id, displayName, oldName, createdAt } }
 * Errors:
 *   400 — conversation is a DM and cannot be renamed, or name is blank.
 *   404 — conversation not found.
 */
export async function renameGroupController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as unknown as ConversationParams;
    const name = req.body.name as string;

    const result = await renameGroup(id, name);

    res.status(200).json({
      ok: true,
      data: result,
    });
  } catch (err) {
    if (err instanceof ConversationFoundError) {
      res.status(404).json({
        ok: false,
        code: "CONVERSATION_NOT_FOUND",
        message: "Conversation not found.",
      });
      return;
    }

    if (err instanceof RenameError) {
      res.status(400).json({
        ok: false,
        code: "RENAME_ERROR",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}
