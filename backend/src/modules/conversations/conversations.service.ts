// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

// BlockList is a Node.js built-in that can block IP addresses.
// We import it here but don't use it yet — it may be used later for security.
import { BlockList } from "node:net";

// prisma is our database client. Every time we want to read or write to the
// database, we use this object. Think of it as the "bridge" between our code
// and the database.
import { prisma } from "../../db/prisma.js";

// `boolean` is a Zod validator type. We import it here but the real validation
// happens in the schema file. This is here in case we need it for runtime checks.
import { boolean } from "zod";

// The shape (type) of the data we expect when someone wants to create a
// conversation. For example: { participantIds, isGroup, name }.
import { ConversationSummarySchema, type ConversationDetail, type ConversationSummary, type CreateConversationBody } from "./conversations.schemas.js";

// The Prisma-generated TypeScript type for a "Conversation" row in the database.
// Using this type keeps our code safe — TypeScript will warn us if we use the
// wrong fields.
import type { Conversation } from "../../generated/prisma/client.js";


// ─────────────────────────────────────────────────────────────────────────────
// UTILITY HELPER
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION TYPE
// ─────────────────────────────────────────────────────────────────────────────

// Prisma transactions let us run multiple database writes at the same time.
// If ANY one of them fails, ALL of them are rolled back (cancelled).
// This keeps the database clean — we never save half a conversation.
//
// `Tx` is a TypeScript type that represents the special "transaction client"
// that Prisma gives us inside a $transaction() block.
// We use it as a parameter type in our helper functions so they always run
// inside a transaction (never by themselves, which could leave the DB dirty).
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];


// ─────────────────────────────────────────────────────────────────────────────
// HELPER: addConversation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new row in the `conversation` table inside a transaction.
 *
 * Why a separate helper?
 *   - Keeps `createConversation` (the main function) clean and easy to read.
 *   - Group conversations need a `name`; private (DM) ones don't.
 *     This function handles both cases in one place.
 *
 * @param tx       - The Prisma transaction client (ensures atomicity).
 * @param isGroup  - true → create a group chat; false → create a private DM.
 * @param name     - The group name (only used when isGroup is true).
 * @returns        - The newly created Conversation row from the database.
 */
async function addConversation(tx: Tx, isGroup: boolean, name: string | undefined): Promise<Conversation> {
    if (isGroup) {
        // Group chat: save isGroup = true AND the group name.
        const convo = await tx.conversation.create({
            data: {
                isGroup: true,
                name: name,   // name was already validated above (not empty)
            },
        });
        return convo;
    } else {
        // Private DM: save isGroup = false. No name needed.
        const convo = await tx.conversation.create({
            data: {
                isGroup: false,
            },
        });
        return convo;
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPER: addParticipant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Adds all participants to the `participant` table for a given conversation.
 *
 * Why a separate helper?
 *   - Role assignment logic lives in one clear place.
 *   - We use `createMany` (a single INSERT for all rows) instead of one
 *     INSERT per user → much faster, especially for large groups.
 *
 * Role rules:
 *   - Private DM  → everyone is ADMIN (both users have equal power).
 *   - Group chat  → the first person in the list (index 0, the creator)
 *                   gets ADMIN; everyone else gets MEMBER.
 *
 * @param tx     - The Prisma transaction client.
 * @param convo  - The conversation we just created (we need its `id`).
 * @param input  - The original request body (contains participantIds & isGroup).
 */
async function addParticipant(tx: Tx, convo: Conversation, input: CreateConversationBody): Promise<void> {
    const { participantIds, isGroup } = input;

    // Build one participant record per user ID.
    // We decide the role here so we only loop through the array once.
    const participants = participantIds.map((userId, index) => ({
        userId,
        conversationId: convo.id,  // link participant to the conversation we just created
        // Group: creator (index 0) is ADMIN, everyone else is MEMBER.
        // Private DM: all participants are ADMIN.
        role: (!isGroup || index === 0) ? ("ADMIN" as const) : ("MEMBER" as const),
    }));

    // Insert ALL participant rows in a single database query.
    // This is faster than running one INSERT per participant.
    await tx.participant.createMany({ data: participants });
}


// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM ERRORS
// ─────────────────────────────────────────────────────────────────────────────
// Why custom error classes instead of plain `throw new Error(...)`?
//   Each class carries a `statusCode` that our HTTP error handler reads
//   automatically and sends the right HTTP response (404, 409, 400, etc.)
//   to the client — without any extra if-else logic in the route handler.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when one or more user IDs in the request do not exist in the database.
 * HTTP 404 → "Not Found"
 */
export class UserNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = "User not found", userId: string) {
    // Include the missing ID(s) in the message so the caller knows exactly
    // which user(s) caused the problem.
    super(message + "with id " + userId);
    this.name = "UserNotFoundError";
  }
}

/**
 * Thrown when the client tries to create a private DM that already exists
 * between the same two users.
 * HTTP 409 → "Conflict" (the resource already exists).
 */
export class DuplicatePrivateConvo extends Error {
    readonly statusCode = 409;

    constructor(message: string) {
        super(message);
        this.name = "DuplicatePrivateConvo";
    }
}

/**
 * Thrown when the same user ID appears more than once in `participantIds`.
 * HTTP 409 → "Conflict" (duplicate data in the request).
 */
export class DuplicateUser extends Error {
    readonly statusCode = 409;

    constructor(message: string) {
        super(message);
        this.name = "DuplicateUser";
    }
}

/**
 * Thrown when the number of participants is wrong for the conversation type.
 *   - Private DM must have exactly 2.
 *   - Group must have at least 3.
 * HTTP 400 → "Bad Request" (the client sent invalid data).
 */
export class InvalidParticipantCount extends Error {
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = "InvalidParticipantCount";
    }
}

/**
 * Thrown when a group conversation is created without a name.
 * HTTP 400 → "Bad Request".
 */
export class GroupNameRequired extends Error {
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = "GroupNameRequired";
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// MAIN SERVICE FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new conversation (private DM or group chat).
 *
 * High-level steps:
 *   1. Check for duplicate participant IDs in the request.
 *   2. Validate the participant count for the conversation type.
 *   3. Validate that a group has a name.
 *   4. Verify that every participant ID actually exists in the database.
 *   5. For private DMs: check that this exact conversation doesn't already exist.
 *   6. Write the conversation + participants to the database (in one transaction).
 *
 * @param input - The validated request body ({ participantIds, isGroup, name? }).
 */
export async function createConversation(input: CreateConversationBody): Promise<Conversation> {

    // ── STEP 1: Reject duplicate user IDs ────────────────────────────────────
    // We deduplicate the IDs with a Set. If the original array and the
    // deduplicated array have different lengths, there was at least one duplicate.
    // We catch this early so the client gets a clear error message instead of
    // a confusing database constraint violation later.
    const uniqueIds = [...new Set(input.participantIds)];

    if (uniqueIds.length !== input.participantIds.length) {
        throw new DuplicateUser("Participant list contains duplicate user IDs");
    }

    // ── STEP 2: Validate participant count ────────────────────────────────────
    // Business rules:
    //   • Private DM  → exactly 2 people (you + the other person).
    //   • Group chat  → at least 3 people (a "group" of 2 is just a DM).
    if (!input.isGroup && input.participantIds.length !== 2) {
        throw new InvalidParticipantCount("A direct message requires exactly 2 participants");
    }
    if (input.isGroup && input.participantIds.length < 3) {
        throw new InvalidParticipantCount("A group conversation requires at least 3 participants");
    }

    // ── STEP 3: Group conversations must have a name ──────────────────────────
    // `.trim()` removes leading/trailing spaces so " " (just spaces) is also
    // treated as empty — a name like "   " would be confusing in the UI.
    if (input.isGroup && !input.name?.trim()) {
        throw new GroupNameRequired("A group conversation must have a name");
    }

    // ── STEP 4: Verify all user IDs exist in the database ────────────────────
    // Strategy: one single SELECT … WHERE id IN (…) query on the primary-key
    // index. This is always faster than N separate findUnique() calls because
    // it only does 1 round-trip to the database instead of N.
    //
    // We only SELECT the `id` column (not the full user row) because we only
    // need to confirm existence — there's no reason to fetch names, emails, etc.
    const foundUsers = await prisma.user.findMany({
        where: { id: { in: uniqueIds } },
        select: { id: true },    // fetch only the id → minimal data transfer
    });

    // If the database returned fewer rows than we asked for, at least one
    // user ID doesn't exist. We figure out WHICH ones are missing so the
    // error message is helpful.
    if (foundUsers.length !== uniqueIds.length) {
        const foundSet   = new Set(foundUsers.map((u) => u.id));
        const missingIds = uniqueIds.filter((id) => !foundSet.has(id));

        // Join the missing IDs into a readable string, e.g. "abc123, def456"
        throw new UserNotFoundError("", missingIds.join(", "));
    }

    // ── STEP 5: Idempotency for private (DM) conversations ───────────────────
    // This check only applies to private (non-group) conversations.
    // For groups we don't block duplicates — two groups CAN have the same members.
    //
    // We look for an existing conversation where:
    //   (a) isGroup is false (so we never accidentally match a group chat)
    //   (b) EVERY requested user is already a participant, AND
    //   (c) NO other users are participants (exact 2-person match, not a subset).
    //
    // If a match is found we RETURN IT immediately instead of creating a
    // duplicate — this is the idempotency rule for one-to-one chats.
    if (!input.isGroup) {
        const ids = [...new Set(input.participantIds)]; // deduplicated (safety)

        const existing = await prisma.conversation.findFirst({
            where: {
                isGroup: false, // (a) never confuse a group with a DM
                AND: ids.map((userId) => ({
                    // Condition (b): this userId IS in the conversation
                    participants: { some: { userId } },
                })),
                // Condition (c): every participant's userId is in our list
                // (no extra participants allowed — exact 2-person match)
                participants: {
                    every: { userId: { in: ids } },
                },
            },
            include: { participants: true },
        });

        // A private conversation between exactly these two users already
        // exists — return it instead of creating a duplicate.
        if (existing) {
            return existing;
        }
    }

    // ── STEP 6: Save the conversation and participants to the database ─────────
    // We use a Prisma $transaction so that both writes (conversation row +
    // participant rows) succeed or fail together.
    //
    // Why a transaction?
    //   Imagine the conversation is created but then addParticipant crashes.
    //   Without a transaction we'd have an "orphan" conversation with no users.
    //   With a transaction, Prisma automatically rolls back the conversation
    //   creation too, leaving the database clean.
    const newConvo = await prisma.$transaction(async (tx) => {
        // 6a. Insert the conversation row (sets isGroup, name).
        const convo = await addConversation(tx, input.isGroup, input.name);

        // 6b. Insert all participant rows (sets userId, conversationId, role).
        await addParticipant(tx, convo, input);

        return convo;
    });

    // If we reach here with no errors thrown, the conversation was created
    // successfully! Return the new conversation so the route handler can
    // send it back to the client (HTTP 201).
    return newConvo;
}




export async function getConversation(id:string, currentUserId:string):Promise<ConversationDetail>{

    // find the convo from the db
    const convo = await  prisma.conversation.findUnique({
        where:{
            id: id
        },
        select:{
            id:true,
            isGroup:true,
            participants:{
                select:{
                    id:true, role:true, joinTime:true,
                    user:{
                        select:{
                            id:true,
                            username:true,
                            avatarAddress:true,
                            lastSeen:true,
                        }
                    }
                }
            },
            messages: {
            orderBy: { createdAt: "desc" }, // newest first
            take: 1,                        // only the latest one
            },
            name:true,
            createdAt:true

        }
    })

    if (!convo) throw new Error("Conversation not found");
   

     

    // participants: {
    //     id: string;
    //     role: "OWNER" | "ADMIN" | "MEMBER";
    //     joinTime: string;
    //     user: {
    //         id: string;
    //         username: string;
    //         avatarAddress: string | null;
    //         lastSeen: Date | null;
    //     };
    // }[];


 const participants = convo.participants;


const unreadCount = await prisma.message.count({
  where: {
    conversationId: id,
    senderId: { not: currentUserId },      // exclude my own messages
    deletedAt: null,                       // exclude soft-deleted
    receipt: { none: { userId: currentUserId } }, // I haven't read them
  },
});

// ── Shape coercion to match ConversationSummary ──────────────────────────────
// joinTime is stored as Date in Prisma — schema expects ISO 8601 string.
const shapedParticipants = participants.map((p) => ({
    ...p,
    joinTime: p.joinTime.toISOString(),
}));

// messages is returned as an array (take: 1). Schema expects a single object
// or null, never an array.
const lastMessage = convo.messages[0]
    ? {
          id:        convo.messages[0].id,
          textBody:  convo.messages[0].textBody,
          senderId:  convo.messages[0].senderId,
          createdAt: convo.messages[0].createdAt.toISOString(),
      }
    : null;

// displayName: for groups use the stored name; for DMs use the other user's username.
const displayName = convo.isGroup
    ? (convo.name ?? "")
    : (participants.find((p) => p.user.id !== currentUserId)?.user.username ?? "");

// displayPicture: group chats have no avatar in v1; DMs show the other user's avatar.
const displayPicture = convo.isGroup
    ? null
    : (participants.find((p) => p.user.id !== currentUserId)?.user.avatarAddress ?? null);

return {
    id:             convo.id,
    isGroup:        convo.isGroup,
    participants:   shapedParticipants,
    lastMessage:    lastMessage,
    createdAt:      convo.createdAt.toISOString(),   // toISOString() → valid datetime string
    unreadCount:    unreadCount,
    displayName:    displayName,
    displayPicture: displayPicture,
};

}


export async function getAllConversations(currentUserId: string): Promise<ConversationSummary[]> {

    // ── 1. Fetch all conversations the current user belongs to ────────────────
    // We include the last message (take:1 ordered desc) and all participants
    // (with their user info) so we can compute displayName/displayPicture
    // client-side without extra queries.
    const conversations = await prisma.conversation.findMany({
        where: {
            participants: { some: { userId: currentUserId } }, // only my convos
        },
        select: {
            id:      true,
            isGroup: true,
            name:    true,
            createdAt: true,
            participants: {
                select: {
                    id:       true,
                    role:     true,
                    joinTime: true,
                    user: {
                        select: {
                            id:            true,
                            username:      true,
                            avatarAddress: true,
                            lastSeen:      true,
                        },
                    },
                },
            },
            messages: {
                orderBy: { createdAt: "desc" }, // newest first
                take: 1,                        // only the latest message
            },
        },
        orderBy: { createdAt: "desc" }, // most recently created first
    });

    // ── 2. Bulk-fetch unread counts (one query, not N) ────────────────────────
    // Group by conversationId to get unread counts for ALL conversations at once.
    // This avoids running a separate COUNT query inside the map() loop below.
    const unreadRows = await prisma.message.groupBy({
        by: ["conversationId"],
        where: {
            conversationId: { in: conversations.map((c) => c.id) },
            senderId:       { not: currentUserId },   // not my own messages
            deletedAt:      null,                     // not soft-deleted
            receipt:        { none: { userId: currentUserId } }, // I haven't read them
        },
        _count: { id: true },
    });

    // Turn the array into a Map<conversationId, count> for O(1) lookup.
    const unreadByConvoId = new Map(
        unreadRows.map((row) => [row.conversationId, row._count.id])
    );

    // ── 3. Map raw Prisma rows → ConversationSummary ──────────────────────────
    const summaries: ConversationSummary[] = conversations.map((convo) => {

        // joinTime is a Date in Prisma — schema expects ISO 8601 string.
        const shapedParticipants = convo.participants.map((p) => ({
            ...p,
            joinTime: p.joinTime.toISOString(),
        }));

        // messages is an array (take: 1) — schema expects object | null.
        const lastMessage = convo.messages[0]
            ? {
                  id:        convo.messages[0].id,
                  textBody:  convo.messages[0].textBody,
                  senderId:  convo.messages[0].senderId,
                  createdAt: convo.messages[0].createdAt.toISOString(),
              }
            : null;

        // displayName: group name for groups, other user's username for DMs.
        const displayName = convo.isGroup
            ? (convo.name ?? "")
            : (convo.participants.find((p) => p.user.id !== currentUserId)?.user.username ?? "");

        // displayPicture: null for groups, other user's avatar for DMs.
        const displayPicture = convo.isGroup
            ? null
            : (convo.participants.find((p) => p.user.id !== currentUserId)?.user.avatarAddress ?? null);

        return {
            id:             convo.id,
            isGroup:        convo.isGroup,
            displayName:    displayName,
            displayPicture: displayPicture,
            participants:   shapedParticipants,
            lastMessage:    lastMessage,
            unreadCount:    unreadByConvoId.get(convo.id) ?? 0,
            createdAt:      convo.createdAt.toISOString(),
        };
    });

    return summaries;
}