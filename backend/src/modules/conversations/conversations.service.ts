import { BlockList } from "node:net";
import { prisma } from "../../db/prisma.js";
import { boolean } from "zod";
import type { CreateConversationBody } from "./conversations.schemas.js";
import type { Conversation } from "../../generated/prisma/client.js";

function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}


// type CreateConvoBody = {
//     userId : string[]
//     name : string
// }




type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function addConversation(tx: Tx, isGroup:boolean, name:string | undefined): Promise<Conversation> {
    if(isGroup){
        const convo = await tx.conversation.create({
        data:{
            isGroup:true, name:name
        }
      })
      return convo
    }else{
        const convo = await tx.conversation.create({
        data:{
            isGroup:false
        }
      })
     return  convo
    }
}

async function addParticipant(tx: Tx, convo: Conversation, input: CreateConversationBody): Promise<void> {
    const { participantIds, isGroup } = input;

    const participants = participantIds.map((userId, index) => ({
        userId,
        conversationId: convo.id,
        // Group: creator (index 0) is ADMIN, everyone else is MEMBER
        // Private: all participants are ADMIN
        role: (!isGroup || index === 0) ? ("ADMIN" as const) : ("MEMBER" as const),
    }));

    await tx.participant.createMany({ data: participants });
}


export class UserNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = "User not found", userId:string) {
    super(message + "with id " + userId);
    this.name = "UserNotFoundError";
  }
}

export class DuplicatePrivateConvo extends Error{
    readonly statusCode = 409;

    constructor(message:string){
    super(message)
    this.name = "DuplicatePrivateConvo"
    }
}

export class DuplicateUser extends Error {
    readonly statusCode = 409

    constructor(message:string){
        super(message)
        this.name = "DuplicateUser"
    }
}

export class InvalidParticipantCount extends Error {
    readonly statusCode = 400

    constructor(message:string){
        super(message)
        this.name = "InvalidParticipantCount"
    }
}

export class GroupNameRequired extends Error {
    readonly statusCode = 400

    constructor(message:string){
        super(message)
        this.name = "GroupNameRequired"
    }
}


export async function createConversation(input : CreateConversationBody) : Promise<void>{

    // verify that the users exist
    //
    // Strategy: one SELECT … WHERE id IN (…) on the primary-key index.
    //   • Deduplicate the input IDs first so the comparison is meaningful.
    //   • Fetch ONLY the id column — no wasted data transfer.
    //   • If the DB returned fewer rows than unique IDs, at least one user
    //     does not exist → throw immediately before touching any other table.
    //
    // Why not Promise.all of N findUnique calls?
    //   N round-trips vs 1. The IN query is always faster at any scale.
    //
    // Why not findMany without select?
    //   We only need presence, not the full user row. select: { id: true }
    //   keeps the payload as small as possible.

    const uniqueIds = [...new Set(input.participantIds)];

    // reject duplicate participant IDs in the request
    if (uniqueIds.length !== input.participantIds.length) {
        throw new DuplicateUser("Participant list contains duplicate user IDs");
    }

    // DM requires exactly 2 participants; group requires 3+
    if (!input.isGroup && input.participantIds.length !== 2) {
        throw new InvalidParticipantCount("A direct message requires exactly 2 participants");
    }
    if (input.isGroup && input.participantIds.length < 3) {
        throw new InvalidParticipantCount("A group conversation requires at least 3 participants");
    }

    // group must have a name
    if (input.isGroup && !input.name?.trim()) {
        throw new GroupNameRequired("A group conversation must have a name");
    }

    const foundUsers = await prisma.user.findMany({
      where : { id: { in: uniqueIds } },
      select: { id: true },             // PK only — minimal data transfer
    });

    if (foundUsers.length !== uniqueIds.length) {
      // At least one ID had no matching row.
      // Build a set of what was found so the error can name the missing ones.
      const foundSet   = new Set(foundUsers.map((u) => u.id));
      const missingIds = uniqueIds.filter((id) => !foundSet.has(id));

      throw new UserNotFoundError("",missingIds.join(", "))
    }

    // if there is only tow users, verify that there is no duplicate convo
   if(input.participantIds.length === 2){
     const ids = [...new Set(input.participantIds)]; // remove duplicates

const conversation = await prisma.conversation.findFirst({
  where: {
    // 1. every requested user is in the conversation
    AND: ids.map((userId) => ({
      participants: { some: { userId } },
    })),
    // 2. nobody else is in the conversation
    participants: {
      every: { userId: { in: ids } },
    },
  },
  include: { participants: true },
});

if(conversation){
    throw new DuplicatePrivateConvo("conversation existe before")
}
   }
     
   
    // add it to the convo table in db
    // if it's a group the one who create the convo is the admin (participantId[0]) if it's not a grpup all of them are admin
    //add perticipant to the db
    await prisma.$transaction(async (tx) => {
        const convo = await addConversation(tx, input.isGroup, input.name);
        await addParticipant(tx, convo, input);
    });

}