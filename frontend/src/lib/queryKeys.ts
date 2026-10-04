/**
 * Query key factory.
 *
 * Use these everywhere instead of raw string arrays so that:
 *  - Keys are consistent across useQuery, prefetchQuery, and invalidateQueries.
 *  - Partial invalidation (e.g. invalidate everything for one conversation)
 *    is trivial — pass the parent tuple to invalidateQueries and React Query
 *    will match all children automatically.
 *
 * Naming scheme
 * ─────────────────────────────────────────────────────
 *  conversations list   →  ['conversations']
 *  one conversation     →  ['conversations', id]
 *  messages of convo    →  ['conversations', id, 'messages']
 *  current user profile →  ['me']
 * ─────────────────────────────────────────────────────
 */

export const queryKeys = {
  /** Current authenticated user. */
  me: () => ['me'] as const,

  /** The full list of conversations the user belongs to. */
  conversations: () => ['conversations'] as const,

  /** A single conversation by ID. */
  conversation: (id: string) => ['conversations', id] as const,

  /** All messages belonging to a conversation. */
  messages: (conversationId: string) =>
    ['conversations', conversationId, 'messages'] as const,
} as const
