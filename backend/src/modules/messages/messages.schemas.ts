import { z } from 'zod';

export const getMessagesParamsSchema = z.object({
  id: z.string().uuid('Invalid conversation ID'),
});

export const getMessagesQuerySchema = z.object({
  cursor: z.string().optional(), // Can be a Date string or a message ID depending on cursor implementation
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
});

export const readMessagesParamsSchema = z.object({
  id: z.string().uuid('Invalid conversation ID'),
});

export const readMessagesBodySchema = z.object({
  lastReadMessageId: z.string().uuid('Invalid message ID'),
});
