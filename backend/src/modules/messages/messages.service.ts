import { prisma } from "../../db/prisma.js";




export class NotAllowed extends Error {
    readonly statusCode = 403;

    constructor(message="you are not allowed for this conversation") {
        super(message);
        this.name = "NotAllowed";
    }
}

type MessagesOutput ={
    hasMore:true,
    messages? : string[] ,
    nextCursor?: string
} 
export async function getMessageService(convoId:string, userId:string, cursor?:string, limit?:number):Promise<void> {

    // verify that the user belong to this convo
    const take = limit ? Math.min(limit, 100) : 50

    const belong = await prisma.participant.findFirst({
        where:{
            userId : userId, conversationId:convoId
        }
    })

    if(!belong){
     throw new NotAllowed("")
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


    
}


