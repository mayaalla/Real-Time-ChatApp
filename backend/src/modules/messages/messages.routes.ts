import { Router } from 'express';
// import { authenticate } from '../../middleware/authenticate.js';
// import { validate } from '../../middleware/validate.js';
// import { getMessagesParamsSchema, getMessagesQuerySchema, readMessagesParamsSchema, readMessagesBodySchema } from './messages.schemas.js';
// import { getMessages, markAsRead } from './messages.controller.js';

const router = Router({ mergeParams: true }); 

/**
 * ROUTES TO BE BUILT:
 * 
 * 1. GET /api/conversations/:id/messages
 *    - Middleware: authenticate
 *    - Middleware: validate({ params: getMessagesParamsSchema, query: getMessagesQuerySchema })
 *    - Handler: getMessages
 *    - Purpose: Fetch paginated messages for a given conversation using cursor-based pagination.
 * 
 * 2. POST /api/conversations/:id/read
 *    - Middleware: authenticate
 *    - Middleware: validate({ params: readMessagesParamsSchema, body: readMessagesBodySchema })
 *    - Handler: markAsRead
 *    - Purpose: Mark all messages in a conversation up to `lastReadMessageId` as READ for the current user.
 */

// Example wiring:
// router.get(
//   '/:id/messages',
//   authenticate,
//   validate({ params: getMessagesParamsSchema, query: getMessagesQuerySchema }),
//   getMessages
// );
// 
// router.post(
//   '/:id/read',
//   authenticate,
//   validate({ params: readMessagesParamsSchema, body: readMessagesBodySchema }),
//   markAsRead
// );

export default router;
