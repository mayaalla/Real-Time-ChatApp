import { prisma } from "../../db/prisma.js";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, type SignUploadBody, type SignUploadResponse } from "./uploads.schemas.js";
import { env } from "../../config/env.js";
import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "crypto";

cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key:    env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
});

// ─── How long the presigned URL stays valid (10 minutes) ────
const UPLOAD_URL_TTL_SECONDS = 60 * 10;

export class NotAllowedToUpload extends Error {
    readonly statusCode = 400

    constructor(message:string) {
        super(message);
        this.name = "NotAllowedToUpload";
    }
}

export class NotAllowed extends Error {
    readonly statusCode = 403

    constructor(message:string) {
        super(message);
        this.name = "NotAllowed";
    }
}

export class NotFound extends Error {
    readonly statusCode = 404

    constructor(message:string) {
        super(message);
        this.name = "NotFound";
    }
}



export async function signUploadService(file:SignUploadBody):Promise<SignUploadResponse> {



    // vefify that the conversation exists
    const conversation = await prisma.conversation.findUnique({
        where: {
            id: file.conversationId,
        },
    });
    
    if(!conversation){
        throw new NotFound(`Conversation ${file.conversationId} not found`);
    }


    // verify that the user is perticipant in the conversation
    const participant = await prisma.participant.findUnique({
        where: {
            userId_conversationId: {
                userId: file.userId,
                conversationId: file.conversationId,
            },
        },
    });
    
    if(!participant){
        throw new NotAllowed(`User ${file.userId} is not a perticipant in the conversation ${file.conversationId}`);
    }

    
    // verify that is allowed type
    if(!ALLOWED_UPLOAD_TYPES.includes(file.fileType)) {
        throw new NotAllowedToUpload(`File type ${file.fileType} is not allowed`);
    }


    // verify that is under the max size
    if(file.fileSize >  MAX_UPLOAD_BYTES) {
        throw new NotAllowedToUpload(`File size ${file.fileSize} is too large`);
    }

    // build the path from pieces: the conversation ID + user ID + today's date + a random string. 
    const today = new Date();
    const datePath = `${today.getUTCFullYear()}/${String(today.getUTCMonth() + 1).padStart(2, "0")}/${String(today.getUTCDate()).padStart(2, "0")}`;
    const uniqueId = randomUUID();
    const storagePath = `chat/${file.conversationId}/${file.userId}/${datePath}/${uniqueId}`;

    // Mixed together, no two files ever collide, and nobody can guess someone else's file location.
    const timestamp = Math.floor(Date.now() / 1000);

   const signature = cloudinary.utils.api_sign_request(
        { timestamp, folder: storagePath, public_id: uniqueId },
        env.CLOUDINARY_API_SECRET as string,
    );

    const uploadUrl = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/auto/upload`;

    const publicUrl = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/auto/upload/${storagePath}`;

    const expiresAt = new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString();


    
    return {
        uploadUrl,
        publicUrl,
        expiresAt,
        signature,
        timestamp,
        apiKey:   env.CLOUDINARY_API_KEY as string,
        folder:   storagePath,
        publicId: uniqueId,
    };
    
    
}


