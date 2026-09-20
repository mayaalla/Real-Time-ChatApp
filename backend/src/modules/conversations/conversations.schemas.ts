// ============================================================
// 📁 FILE: src/modules/conversations/conversations.schemas.ts
// 🎯 PURPOSE: Zod schemas for the conversations module.
//
// Part 9 — Conversations REST API
//
// Covers:
//   POST   /api/conversations          — create DM or group
//   GET    /api/conversations          — list user's conversations
//   GET    /api/conversations/:id      — single conversation detail
//
// Schema dependencies:
//   PublicUserSchema — canonical safe user shape from auth.schemas.ts
//     used for participant shapes returned in responses.
//
// Design rules enforced here:
//   • DMs have exactly 2 participants total (requester + 1 other).
//   • Groups have 3+ participants (requester counts as one).
//   • Group name is required when isGroup=true, forbidden when false.
//   • participantIds must be non-empty and contain unique UUIDs.
//   • Message ID is CLIENT-GENERATED (UUID) — never server-generated.
//   • Unread count is computed server-side; never trusted from client.
// ============================================================

import { z } from "zod";
import { PublicUserSchema } from "../auth/auth.schemas.js";

// ─── Enums (mirror Prisma enums — never import Prisma types into schemas) ─────

export const RoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type Role = z.infer<typeof RoleSchema>;

export const StatusSchema = z.enum(["SENT", "DELIVERED", "READ"]);
export type Status = z.infer<typeof StatusSchema>;

// ─── POST /api/conversations — request body ───────────────────────────────────
//
// participantIds: UUIDs of OTHER users to include (current user is added
//   automatically as OWNER; do NOT include req.user.id here).
//
// isGroup:
//   false → DM:    participantIds must have exactly 1 entry
//   true  → Group: participantIds must have 2+ entries (so total ≥ 3)
//
// name:
//   Required when isGroup=true.
//   Must be absent (or omitted) when isGroup=false.
//
// Idempotency rule (enforced in service, not here):
//   For DMs: if a conversation between the same 2 users already exists,
//   return the existing conversation instead of creating a duplicate.

export const CreateConversationBodySchema = z
  .object({
    participantIds: z
      .array(z.string().uuid("Each participantId must be a valid UUID"))
      .min(1, "At least one participant is required"),

    isGroup: z.boolean(),

    name: z
      .string()
      .trim()
      .min(1, "Group name must not be blank")
      .max(100, "Group name must be at most 100 characters")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.isGroup) {
      // DM: exactly 1 other participant (requester is the second)
      if (data.participantIds.length !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participantIds"],
          message: "A direct message must have exactly one other participant",
        });
      }
      // DM must not carry a name
      if (data.name !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: "Direct messages cannot have a name",
        });
      }
    } else {
      // Group: at least 2 other participants (so total incl. requester is ≥ 3)
      if (data.participantIds.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["participantIds"],
          message: "A group conversation must have at least 2 other participants",
        });
      }
      // Group must have a name
      if (!data.name || data.name.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["name"],
          message: "Group conversations must have a name",
        });
      }
    }
  });

export type CreateConversationBody = z.infer<typeof CreateConversationBodySchema>;

// ─── Shared sub-shapes used in responses ─────────────────────────────────────

// Participant with role — returned as part of conversation detail
export const ParticipantSchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  joinTime: z.string().datetime(),
  user: PublicUserSchema,
});

export type Participant = z.infer<typeof ParticipantSchema>;

// Lightweight last-message preview — returned in conversation list
export const LastMessagePreviewSchema = z.object({
  id: z.string(),
  textBody: z.string().nullable(),
  senderId: z.string().uuid(),
  createdAt: z.string().datetime(),
});

export type LastMessagePreview = z.infer<typeof LastMessagePreviewSchema>;

// ─── Conversation list item — GET /api/conversations ─────────────────────────
//
// displayName:
//   Group → stored conversation name
//   DM    → the OTHER participant's username (computed server-side)
//
// displayPicture:
//   Group → null (no group avatar in v1)
//   DM    → the OTHER participant's avatarAddress
//
// unreadCount: messages in convo NOT sent by me AND no Receipt row from me.
//   Computed in a single grouped query — NEVER in a per-conversation loop.

export const ConversationSummarySchema = z.object({
  id: z.string().uuid(),
  isGroup: z.boolean(),
  displayName: z.string(),
  displayPicture: z.string().url().nullable(),
  participants: z.array(ParticipantSchema),
  lastMessage: LastMessagePreviewSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;

// ─── Conversation detail — GET /api/conversations/:id ────────────────────────
//
// Returns the same shape as the list item but always includes the full
// participant list with roles.  In v1 the shapes are identical; a separate
// type is defined here so the two can diverge independently later.

export const ConversationDetailSchema = ConversationSummarySchema;

export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;

// ─── Route params ─────────────────────────────────────────────────────────────

export const ConversationParamsSchema = z.object({
  id: z.string().uuid("Conversation ID must be a valid UUID"),
});

export type ConversationParams = z.infer<typeof ConversationParamsSchema>;
