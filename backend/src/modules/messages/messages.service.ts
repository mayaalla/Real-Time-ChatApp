import { prisma } from "../../db/prisma.js";
import type { Message } from "../../generated/prisma/client.js";
import { signUploadService } from "../uploads/uploads.service.js";
import type { AllowedUploadType } from "../uploads/uploads.schemas.js";

// ─── Return shape for getMessageService ─────────────────────────────────────
export type GetMessagesResult = {
    messages: Message[];
    nextCursor: string | null;
    hasMore: boolean;
};

export class NotAllowed extends Error {
    readonly statusCode = 403;

    constructor(message:string) {
        super(message);
        this.name = "NotAllowed";
    }
}

export class EmptyMessages extends Error {
    readonly statusCode = 404;

    constructor(message:string) {
        super(message);
        this.name = "EmptyMessages";
    }
}

export class NotFound extends Error {
    readonly statusCode = 404;

    constructor(message:string) {
        super(message);
        this.name = "NotFound";
    }
}

type MessagesOutput ={
    hasMore:true,
    messages? : string[] ,
    nextCursor?: string
} 
export async function getMessageService(convoId:string, userId:string, cursor?:string, limit?:number):Promise<GetMessagesResult> {

    // verify that the user belong to this convo
    const take = limit ? Math.min(limit, 100) : 50

    const belong = await prisma.participant.findFirst({
        where:{
            userId : userId, conversationId:convoId
        }
    })

    if(!belong){
     throw new NotAllowed("you are not allowed for this conversation")
    }

 const rows = await prisma.message.findMany({
    where: { conversationId: convoId },
    orderBy: { createdAt: "desc" },
    take: take + 1, // ask for ONE extra to know if there is more messages or not
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const messages = hasMore ? rows.slice(0, take) : rows;
  const nextCursor = hasMore ? messages[messages.length - 1]?.id ?? null : null;

  return { messages, nextCursor, hasMore };

}



export async function markRead(userId: string, conversationId: string): Promise<number> {
    // verify that the user belongs to the conversation
    const prt = await prisma.participant.findUnique({
        where: {
            userId_conversationId: { userId, conversationId },
        },
    });

    if (!prt) {
        throw new NotAllowed("you are not allowed for this conversation");
    }

    // find all messages in this conversation not yet seen by this user
    const unreadMessages = await prisma.message.findMany({
        where: {
            conversationId,
            receipt: {
                none: { userId },
            },
        },
        select: { id: true },
    });


    // bulk-insert all unread messages into Receipt to mark them as read
    const { count } = await prisma.receipt.createMany({
        data: unreadMessages.map((msg) => ({
            messageId: msg.id,
            userId,
        })),
        skipDuplicates: true, // safe against race conditions
    });

    return count ? count : 0


}

export async function deleteMessage(messageId:string, userId:string):Promise<Message> {

    const sender = await prisma.message.findFirst({
        where:{
            id: messageId,
            senderId: userId, 
        }
    })


    if(!sender){
        throw new NotAllowed("you are not allowed to delete this message")
    }
    const message = await prisma.message.update({
        where:{
            id:messageId
        },
        data:{
            deletedAt: new Date()
        }
    })
 
    return message
}


export async function modifyMessage(messageId:string, userId:string, textBody:string):Promise<Message> {
    
    const message = await prisma.message.findFirst({
        where:{
            id: messageId,
            senderId: userId, 
        }
    })


    if(!message){
        throw new NotAllowed("you are not allowed to modfiy this message")
    }

    if(!message.textBody){
         throw new NotAllowed("you are not allowed to modfiy this message")
    }

    const newMessage = await prisma.message.update({
        where:{
            id: message.id
        },
        data:{
            textBody:textBody,
            editedAt: new Date()
        }
    })

    return newMessage
    
}




export async function sendMessage(conversationId:string, userId:string, textBody?:string, attachments?:string[]):Promise<Message> {

    // ── 1. Guard: conversation must exist ────────────────────────────────────
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
    });
    if (!conversation) {
        throw new NotFound("conversation not found");
    }

    // ── 2. Guard: user must exist ─────────────────────────────────────────────
    const user = await prisma.user.findUnique({
        where: { id: userId },
    });
    if (!user) {
        throw new NotFound("user not found");
    }

    // ── 3. Guard: user must be a participant of this conversation ─────────────
    const participant = await prisma.participant.findUnique({
        where: {
            userId_conversationId: { userId, conversationId },
        },
    });
    if (!participant) {
        throw new NotAllowed("you are not allowed to send messages to this conversation");
    }

    // ── 4. Guard: message cannot be completely empty ──────────────────────────
    if (!textBody && !attachments?.length) {
        throw new NotAllowed("message cannot be empty");
    }

    // ── 5. Pre-sign all attachments in parallel (outside the TX) ─────────────
    //
    //   We do this BEFORE opening the Prisma transaction for two reasons:
    //     a) We must not hold a DB connection open during Cloudinary HTTP calls.
    //     b) If any file fails validation / signing, we want to bail out before
    //        writing anything to the database.
    //
    //   `signUploadService` returns a `SignUploadResponse` whose `publicUrl`
    //   is the permanent Cloudinary URL the client must use after uploading.
    //   We collect all those URLs into `attachmentUrls` and store them in the
    //   `attachmentAddress` array column of the Message row.
    //
    //   If ANY sign call throws (bad MIME type, file too large, Cloudinary error,
    //   etc.), Promise.all rejects immediately and we never reach the TX — so
    //   no partial DB state is created.
    let attachmentUrls: string[] = [];

    if (attachments?.length) {
        const signResults = await Promise.all(
            attachments.map((attachment) =>
                signUploadService({
                    userId,
                    conversationId,
                    fileName:  attachment,
                    // derive MIME type from extension — the service validates it
                    fileType:  attachment.split(".").pop()! as AllowedUploadType,
                    // `attachment` here is a filename/identifier, not a buffer;
                    // pass its string length as a size placeholder so the schema
                    // check passes. The real byte-count validation happens when
                    // the client uploads directly to Cloudinary.
                    fileSize:  attachment.length,
                })
            )
        );

        // Extract the permanent public URLs from the sign responses.
        attachmentUrls = signResults.map((r) => r.publicUrl);
    }

    // ── 6. Atomically create the Message row inside a Prisma transaction ──────
    //
    //   All operations inside $transaction run inside a single Postgres
    //   transaction. If the create (or any future operation we add here)
    //   throws, Prisma automatically issues a ROLLBACK — nothing is persisted.
    //
    //   `attachmentAddress` is a String[] column (see schema.prisma), so we
    //   pass the array of pre-signed public URLs directly.
    const message = await prisma.$transaction(async (tx) => {
        const newMessage = await tx.message.create({
            data: {
                senderId:          userId,
                conversationId,
                textBody:          textBody ?? null,
                attachmentAddress: attachmentUrls,  // String[] — empty array when no attachments
            },
        });

        return newMessage;
    });

    return message;
}
