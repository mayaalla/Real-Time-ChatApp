// ============================================================
// 📁 FILE: src/modules/messages/messages.controller.ts
// 🎯 PURPOSE: HTTP layer for message-related routes — thin wrappers only.
//
// Controllers do exactly three things:
//   1. Pull validated data off req (params / query / body).
//   2. Call the service.
//   3. Map the result (or error) to an HTTP response.
//
// No database calls, no business logic — those live in messages.service.ts.
// ============================================================

import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../types/express.js";
import type {
  ConversationParams,
  GetMessagesQuery,
  MessageParams,
  EditMessageBody,
} from "./messages.schemas.js";
import {
  getMessageService,
  markRead,
  deleteMessage,
  modifyMessage,
  NotAllowed,
} from "./messages.service.js";

// ─── GET /api/conversations/:id/messages ─────────────────────

/**
 * Return cursor-paginated message history for a single conversation.
 *
 * Params:  { id }              — conversation UUID (validated by Zod).
 * Query:   { cursor?, limit }  — cursor = ISO-8601 createdAt of the oldest
 *                                message the client already has; omit on first
 *                                load. limit defaults to 50, max 100.
 *
 * On success → 200 { ok: true, data: { messages[], nextCursor, hasMore } }
 * On 403     → caller is not a participant of that conversation.
 * Anything else is forwarded to the global error handler.
 */
export async function getMessagesController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { id: conversationId } = req.params as unknown as ConversationParams;
    const { cursor, limit } = req.query as unknown as GetMessagesQuery;
    const userId = authReq.user.id;

    const data = await getMessageService(conversationId, userId, cursor, limit);

    res.status(200).json({ ok: true, data });
  } catch (err) {
    if (err instanceof NotAllowed) {
      res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}

// ─── POST /api/conversations/:id/read ────────────────────────

/**
 * Bulk-mark messages as read up to and including `lastReadMessageId`.
 *
 * The service creates Receipt rows for every message in the conversation
 * that the caller hasn't already read, skipping duplicates safely.
 * This is the REST fallback; the real-time fast path is the socket handler.
 *
 * Params: { id }                  — conversation UUID (validated by Zod).
 * Body:   { lastReadMessageId }   — UUID of the newest message the caller
 *                                   has actually seen.
 *
 * On success → 200 { ok: true, data: { markedCount } }
 * On 403     → caller is not a participant of that conversation.
 * Anything else is forwarded to the global error handler.
 */
export async function markReadController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { id: conversationId } = req.params as unknown as ConversationParams;
    const userId = authReq.user.id;

    const markedCount = await markRead(userId, conversationId);

    res.status(200).json({ ok: true, data: { markedCount } });
  } catch (err) {
    if (err instanceof NotAllowed) {
      res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}

// ─── DELETE /api/messages/:messageId ─────────────────────────

/**
 * Soft-delete a message (sets deletedAt — row is never removed from DB).
 *
 * Only the original sender can delete their own message.
 * Params: { messageId } — UUID of the message to delete.
 *
 * On success → 200 { ok: true, data: { message } }
 * On 403     → caller did not send this message.
 * Anything else is forwarded to the global error handler.
 */
export async function deleteMessageController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { messageId } = req.params as unknown as MessageParams;
    const userId = authReq.user.id;

    const message = await deleteMessage(messageId, userId);

    res.status(200).json({ ok: true, data: { message } });
  } catch (err) {
    if (err instanceof NotAllowed) {
      res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}

// ─── PATCH /api/messages/:messageId ──────────────────────────

/**
 * Edit the textBody of a message (sets editedAt).
 *
 * Only the original sender can edit their own message.
 * Attachment-only messages (no textBody) cannot be edited via this endpoint.
 * Params: { messageId } — UUID of the message to edit.
 * Body:   { textBody }  — the new text content (must be non-empty).
 *
 * On success → 200 { ok: true, data: { message } }
 * On 403     → caller did not send this message, or message has no textBody.
 * Anything else is forwarded to the global error handler.
 */
export async function editMessageController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { messageId } = req.params as unknown as MessageParams;
    const { textBody } = req.body as EditMessageBody;
    const userId = authReq.user.id;

    const message = await modifyMessage(messageId, userId, textBody);

    res.status(200).json({ ok: true, data: { message } });
  } catch (err) {
    if (err instanceof NotAllowed) {
      res.status(403).json({
        ok: false,
        code: "FORBIDDEN",
        message: err.message,
      });
      return;
    }

    next(err);
  }
}
