import { prisma } from "../../db/prisma.js";
import type { Message, Receipt, User } from "../../generated/prisma/client.js";




export class NotAllowed extends Error {
    readonly statusCode = 403;

    constructor(message:string) {
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


    
}



export async function readMessage(userId:string, messageId:string):Promise<Receipt> {
// verify that the use belong to the conversation
 const conversation = await prisma.message.findFirst({where:{id:messageId}})
 const belong = await prisma.participant.findFirst({
        where:{
            userId : userId, conversationId:conversation?.conversationId
        }
    })

     if(!belong){
     throw new NotAllowed("you are not allowed for this conversation")
    }

    const read = await prisma.receipt.create({
     data:{
        userId: userId, messageId:messageId
     }   
    })


    return read


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