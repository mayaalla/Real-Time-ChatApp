// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS
// ─────────────────────────────────────────────────────────────────────────────

// prisma is our database client. Every time we want to read or write to the
// database, we use this object. Think of it as the "bridge" between our code
// and the database.
import { prisma } from "../../db/prisma.js";

// The shape (type) of the data we expect when someone wants to create a
// conversation. For example: { participantIds, isGroup, name }.
import { type ConversationDetail, type ConversationSummary, type CreateConversationBody, type Participant } from "./conversations.schemas.js";

// The Prisma-generated TypeScript type for a "Conversation" row in the database.
// Using this type keeps our code safe — TypeScript will warn us if we use the
// wrong fields.
import type { Conversation } from "../../generated/prisma/client.js";


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
async function addParticipants(tx: Tx, convo: Conversation, input: CreateConversationBody, creatorId: string): Promise<void> {
    const { participantIds, isGroup } = input;

    // Build one participant record per user ID.
    // Creator always gets OWNER role — this is required by the spec.
    // All other participants get MEMBER role by default.
    const participants = [
        // Creator first — always OWNER, regardless of DM or group.
        { userId: creatorId, conversationId: convo.id, role: "OWNER" as const },

        // Remaining participants — MEMBER role for everyone else.
        ...participantIds.map((userId) => ({
            userId,
            conversationId: convo.id,
            role: "MEMBER" as const,
        })),
    ];

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

export class ConversationFoundError extends Error {
    readonly statusCode = 404;

    constructor(message = "Conversation not found", convoId: string) {
        // Include the missing ID(s) in the message so the caller knows exactly
        // which user(s) caused the problem.
        super(message + "with id " + convoId);
        this.name = "ConversationFoundError";
    }
}

export class AddParticipantError extends Error {
    readonly statusCode = 400;

    constructor(message: string) {
        // Include the missing ID(s) in the message so the caller knows exactly
        // which user(s) caused the problem.
        super(message);
        this.name = "AddParticipantError";
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

export class RenameError extends Error {
    readonly statusCode = 400;

    constructor(message: string) {
        super(message);
        this.name = "RenameError";
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// SHARED GUARD — isParticipant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks whether a user is a member of a given conversation.
 *
 * This is the SINGLE SOURCE OF TRUTH for conversation access control.
 * It must be called before ANY operation that reads or writes to a conversation.
 *
 * Used by:
 *   - REST handlers (getConversation, addParticipant, deleteParticipant, etc.)
 *   - Socket.IO handlers (message:send, message:read, typing, etc.)
 *
 * NEVER inline this check. NEVER trust a user-supplied conversationId without
 * running this guard first.
 *
 * @param userId         - The authenticated user's ID (from req.user.id or socket.data.userId).
 * @param conversationId - The conversation to check membership for.
 * @returns              - true if the user is a participant; false otherwise.
 */
export async function isParticipant(userId: string, conversationId: string): Promise<boolean> {
    const participant = await prisma.participant.findUnique({
        where: {
            // @@unique([userId, conversationId]) — the composite unique key on the table.
            // Prisma exposes this as `userId_conversationId` for findUnique.
            userId_conversationId: { userId, conversationId },
        },
        select: { id: true }, // we only need to know it exists — select minimal data
    });

    return participant !== null;
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
 * @param input      - The validated request body ({ participantIds, isGroup, name? }).
 * @param creatorId  - The ID of the authenticated user creating the conversation.
 *                     They are always added as OWNER and are NOT listed in participantIds.
 */
export async function createConversation(input: CreateConversationBody, creatorId: string): Promise<Conversation> {

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
    // participantIds contains OTHER users only — the creator is added separately.
    // Business rules:
    //   • Private DM  → exactly 1 other person (creator + 1 = 2 total).
    //   • Group chat  → at least 2 others (creator + 2 = 3 total minimum).
    if (!input.isGroup && input.participantIds.length !== 1) {
        throw new InvalidParticipantCount("A direct message requires exactly 1 other participant");
    }
    if (input.isGroup && input.participantIds.length < 2) {
        throw new InvalidParticipantCount("A group conversation requires at least 2 other participants");
    }

    // ── STEP 3: Group conversations must have a name ──────────────────────────
    // `.trim()` removes leading/trailing spaces so "  " (just spaces) is also
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
        const foundSet = new Set(foundUsers.map((u) => u.id));
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
    //   (b) EVERY requested user + creator is already a participant, AND
    //   (c) NO other users are participants (exact 2-person match, not a subset).
    //
    // If a match is found we RETURN IT immediately instead of creating a
    // duplicate — this is the idempotency rule for one-to-one chats.
    if (!input.isGroup) {
        // Both the creator and the other participant must be in the conversation.
        const allIds = [...new Set([creatorId, ...input.participantIds])];

        const existing = await prisma.conversation.findFirst({
            where: {
                isGroup: false, // (a) never confuse a group with a DM
                AND: allIds.map((userId) => ({
                    // Condition (b): this userId IS in the conversation
                    participants: { some: { userId } },
                })),
                // Condition (c): every participant's userId is in our list
                // (no extra participants allowed — exact 2-person match)
                participants: {
                    every: { userId: { in: allIds } },
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
    //   Imagine the conversation is created but then addParticipants crashes.
    //   Without a transaction we'd have an "orphan" conversation with no users.
    //   With a transaction, Prisma automatically rolls back the conversation
    //   creation too, leaving the database clean.
    const newConvo = await prisma.$transaction(async (tx) => {
        // 6a. Insert the conversation row (sets isGroup, name).
        const convo = await addConversation(tx, input.isGroup, input.name);

        // 6b. Insert all participant rows (creator as OWNER + others as MEMBER).
        await addParticipants(tx, convo, input, creatorId);

        return convo;
    });

    // If we reach here with no errors thrown, the conversation was created
    // successfully! Return the new conversation so the route handler can
    // send it back to the client (HTTP 201).
    return newConvo;
}


export async function getConversation(id: string, currentUserId: string): Promise<ConversationDetail> {

    // ── STEP 1: Membership check (SECURITY — must be first) ───────────────────
    // Never let an authenticated user read a conversation they don't belong to.
    // We return 403 (or 404 to hide existence) instead of leaking conversation data.
    const isMember = await isParticipant(currentUserId, id);
    if (!isMember) {
        throw new ConversationFoundError("Conversation not found", id);
    }

    // find the convo from the db
    const convo = await prisma.conversation.findUnique({
        where: {
            id: id
        },
        select: {
            id: true,
            isGroup: true,
            participants: {
                select: {
                    id: true, role: true, joinTime: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            avatarAddress: true,
                            lastSeen: true,
                        }
                    }
                }
            },
            messages: {
                orderBy: { createdAt: "desc" }, // newest first
                take: 1,                        // only the latest one
            },
            name: true,
            createdAt: true,
        }
    });

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
            id: convo.messages[0].id,
            textBody: convo.messages[0].textBody,
            senderId: convo.messages[0].senderId,
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
        id: convo.id,
        isGroup: convo.isGroup,
        participants: shapedParticipants,
        lastMessage: lastMessage,
        createdAt: convo.createdAt.toISOString(),   // toISOString() → valid datetime string
        unreadCount: unreadCount,
        displayName: displayName,
        displayPicture: displayPicture,
    };
}


export async function getAllConversations(currentUserId: string): Promise<ConversationSummary[]> {

    // current user id you will get from the authorization middleware from req.user.id

    // ── 1. Fetch all conversations the current user belongs to ────────────────
    // We include the last message (take:1 ordered desc) and all participants
    // (with their user info) so we can compute displayName/displayPicture
    // client-side without extra queries.
    const conversations = await prisma.conversation.findMany({
        where: {
            participants: { some: { userId: currentUserId } }, // only my convos
        },
        select: {
            id: true,
            isGroup: true,
            name: true,
            createdAt: true,
            participants: {
                select: {
                    id: true,
                    role: true,
                    joinTime: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            avatarAddress: true,
                            lastSeen: true,
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
            senderId: { not: currentUserId },   // not my own messages
            deletedAt: null,                    // not soft-deleted
            receipt: { none: { userId: currentUserId } }, // I haven't read them
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
                id: convo.messages[0].id,
                textBody: convo.messages[0].textBody,
                senderId: convo.messages[0].senderId,
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
            id: convo.id,
            isGroup: convo.isGroup,
            displayName: displayName,
            displayPicture: displayPicture,
            participants: shapedParticipants,
            lastMessage: lastMessage,
            unreadCount: unreadByConvoId.get(convo.id) ?? 0,
            createdAt: convo.createdAt.toISOString(),
        };
    });

    return summaries;
}


export async function getParticipents(id: string): Promise<Participant[]> {

    const conv = await prisma.participant.findMany({
        where: {
            conversationId: id
        },
        select: {
            id: true, role: true, joinTime: true,
            user: {
                select: {
                    id: true, username: true, avatarAddress: true, lastSeen: true
                }
            }
        }
    });

    // `findMany` always returns an array — it is NEVER null.
    // An empty array means the conversation doesn't exist (or has no participants).
    if (conv.length === 0) {
        throw new ConversationFoundError("", id);
    }

    const result = conv.map(p => ({
        ...p,
        joinTime: p.joinTime.toISOString()
    }));

    return result;
}


export async function deleteParticipent(idConvo: string, id: string) {

    // veirfy the the convo exist along side with teh participent
    const conv = await prisma.participant.findUnique({
        where: {
            id: id,
        },
        select: {
            id: true, role: true, joinTime: true,
            user: {
                select: {
                    id: true, username: true, avatarAddress: true, lastSeen: true
                }
            }
        }
    });

    if (!conv) {
        throw new ConversationFoundError("", id);
    }

    // delete it from the convo
    await prisma.participant.delete({
        where: {
            id: id,
        },
    });

    return { message: "Participant removed from conversation successfully." };
}

type Rename = Pick<ConversationSummary, "id" | "displayName" | "createdAt"> & {
    oldName: string | null;
};

export async function renameGroup(id: string, name: string): Promise<Rename> {

    // verify that the convo existe
    const conv = await prisma.conversation.findUnique({
        where: {
            id: id
        },
        select: {
            id: true, isGroup: true, name: true, createdAt: true
        }
    });

    if (!conv) {
        throw new ConversationFoundError("", id);
    }

    // verify it's not a DM — only group conversations can be renamed
    if (!conv.isGroup) {
        throw new RenameError("you cannot rename a direct message");
    }

    // update the name in the database
    await prisma.conversation.update({
        where: { id },
        data: { name },
    });

    const output = {
        id: conv.id, displayName: name, oldName: conv.name, createdAt: conv.createdAt.toISOString()
    };

    return output;
}



export async function addParticipant(idConvo: string, idUser: string): Promise<Participant> {

    // verify that the user exists
    const user = await prisma.user.findUnique({
        where: {
            id: idUser
        }
    })
    if (!user) {
        throw new UserNotFoundError("", idUser)
    }

    // verify that the conversation exists
    const convo = await prisma.conversation.findUnique({
        where: {
            id: idConvo
        },
        select: {
            id: true, participants: true, isGroup: true
        }
    })

    if (!convo) {
        throw new ConversationFoundError("", idConvo)
    }

    // Only group conversations allow adding participants.
    // DMs are always exactly 2 people.
    if (!convo.isGroup) {
        throw new AddParticipantError("you cannot add other users to a private chat")
    }

    // Guard against adding a user who is already in the conversation.
    // Without this check, Prisma would throw a raw DB unique-constraint error
    // instead of a clean, readable error message for the client.
    const alreadyMember = await isParticipant(idUser, idConvo);
    if (alreadyMember) {
        throw new AddParticipantError("User is already a participant in this conversation");
    }

    // ADD THE PARTICIPANT TO THE CONVERSATION
    const pert = await prisma.participant.create({
        data: {
            role: "MEMBER",
            userId: idUser,
            conversationId: idConvo
        }
    })

    const output = {
        id: pert.id, role: pert.role,
        // toISOString() produces "2026-09-21T16:00:00.000Z" — required by the
        // z.string().datetime() schema. toDateString() was wrong ("Mon Sep 21 2026").
        joinTime: pert.joinTime.toISOString(),
        user: {
            id: idUser, username: user.username,
            avatarAddress: user.avatarAddress,
            lastSeen: user.lastSeen
        }
    }

    return output

}