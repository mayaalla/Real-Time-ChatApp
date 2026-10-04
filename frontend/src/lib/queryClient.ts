/**
 * React Query client — singleton, configured once.
 *
 * Defaults chosen for a chat application:
 *  - staleTime 30 s  — avoids a waterfall of refetches while the user is
 *    actively reading; real-time updates arrive via Socket.IO anyway.
 *  - retry 1         — one silent retry on transient network errors is enough.
 *  - refetchOnWindowFocus false — chat history doesn't need a full reload
 *    every time the user switches tabs.
 *
 * ─── Query key naming scheme ────────────────────────────────────────────────
 *
 *   conversations list   →  ['conversations']
 *   one conversation     →  ['conversations', conversationId]
 *   messages of convo    →  ['conversations', conversationId, 'messages']
 *   current user profile →  ['me']
 *
 * All keys are exported from src/lib/queryKeys.ts so components never
 * hardcode strings.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,         // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
