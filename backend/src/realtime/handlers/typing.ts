import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { redisClient } from "../../redis/client.js";
import { isParticipant } from "../../modules/conversations/conversations.service.js";
import { ClientEvents, ServerEvents } from "../events.js";
import { safeHandler, emitError } from "./utils.js";


const typingKey = (conversationId: string, userId: string) =>
  `typing:${conversationId}:${userId}`;

// Redis "KEYS typing:{conversationId}:*" finds all typers in a conversation.
const typingPattern = (conversationId: string) => `typing:${conversationId}:*`;

const TYPING_