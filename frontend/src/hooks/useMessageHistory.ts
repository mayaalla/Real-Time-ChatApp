import { useInfiniteQuery } from "@tanstack/react-query";
import { useAuthStore }     from "../store/authStore";
import { fetchMessages, type Message } from "../api/messages.api";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Wraps useInfiniteQuery to fetch message history for one conversation.
// Returns:
//   messages       → all messages, oldest-first, ready to render top-to-bottom
//   isLoading      → true while the very first page is loading
//   isFetchingMore → true while loading an older page (user scrolled up)
//   hasMore        → true if there are older messages we have not fetched yet
//   loadMore()     → call this to fetch the next older page
//
// ─────────────────────────────────────────────────────────────────────────────

export function useMessageHistory(conversationId: string) {
  const token = useAuthStore((s) => s.accessToken)!;

  const query = useInfiniteQuery({
    queryKey: ["messages", conversationId],

    // queryFn is called every time React Query needs a page.
    // pageParam is the cursor for that page (string) or null on the first call.
    queryFn: ({ pageParam }) =>
      fetchMessages(conversationId, token, pageParam ?? undefined),

    // Tell React Query: use the nextCursor from each page as the pageParam
    // for the NEXT page. Returning null signals there are no more pages.
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? null,

    // Cast so React Query infers PageParam as `string | null`, not just `null`.
    // Without the cast it infers null-only and rejects string cursors from getNextPageParam.
    initialPageParam: null as string | null,

    // Keep old data while re-fetching so the screen does not go blank.
    placeholderData: (prev) => prev,
  });

  // React Query stores pages in the order they were fetched:
  //   pages[0] = first page fetched  (newest 50 messages, newest at index 0)
  //   pages[1] = second page fetched (older 50, newest at index 0)
  //   ...and so on as the user scrolls up.
  //
  // We need ONE flat array, OLDEST message first.
  // Step 1: Reverse the pages array so the oldest page comes first.
  // Step 2: Within each page, reverse the messages (server returns newest-first).
  const messages: Message[] = (query.data?.pages ?? [])
    .slice()               // copy — do NOT mutate the original
    .reverse()             // oldest page first
    .flatMap((page) => page.messages.slice().reverse()); // oldest message first in each page

  return {
    messages,
    isLoading:      query.isLoading,
    isFetchingMore: query.isFetchingNextPage,
    hasMore:        query.hasNextPage ?? false,
    loadMore:       query.fetchNextPage,
  };
}
