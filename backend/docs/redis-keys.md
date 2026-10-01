# Redis Key Naming Scheme

All keys follow a colon-separated hierarchy: `category:subcategory:identifier`

---

## presence:user:{userId}

**Type:** Set (a collection of unique string values)
**Example key:** `presence:user:11111111-2222-3333-4444-555555555555`
**Example value:** `{ "socket-abc123", "socket-xyz789" }` (a set of socket IDs)

**What it stores:** All the socket IDs that belong to this user RIGHT NOW.
A user might have two browser tabs open = two socket IDs in this set.

**Lifetime:** The key has a TTL of 60 seconds, refreshed every 30 seconds
while the user is connected. If the server crashes and stops refreshing,
the key expires on its own and the user automatically appears offline.

**When it's created:** When a user's socket connects.
**When it's deleted:** When the set becomes empty (all sockets disconnected).

---

## presence:online

**Type:** Set
**Example value:** `{ "userId-aaa", "userId-bbb" }` (a set of user IDs)

**What it stores:** The set of all currently online user IDs.
Useful for quick lookups like "how many people are online right now?"

**Lifetime:** Entries are added on connect, removed on disconnect.
No TTL on the set itself — it is managed manually.

---

## typing:{conversationId}:{userId}

**Type:** String (the value doesn't matter — the key's EXISTENCE is the signal)
**Example key:** `typing:abc-convo-id:user-id-111`
**Example value:** `"1"` (just a placeholder)

**What it stores:** The fact that this user is currently typing in this conversation.

**Lifetime:** TTL of 5 seconds. Set fresh each time the client sends `typing:start`.
If the user closes their laptop mid-sentence, the key disappears after 5 seconds
and the "typing..." indicator vanishes automatically. No cleanup code needed.

**When it's created:** When the server handles the `typing:start` event.
**When it's deleted:** Either manually (on `typing:stop`) or automatically (TTL expires).

---

## ratelimit:{userId}:{windowTimestamp}

**Type:** String (contains an integer counter)
**Example key:** `ratelimit:user-id-111:1700000060`
**Example value:** `"4"` (sent 4 messages in the current window)

**What it stores:** How many messages this user has sent in the current time window.
Used to block flood/spam attempts.

**Lifetime:** TTL matches the window size (e.g., 60 seconds).
The counter auto-deletes when the window ends.

---

## refresh:{tokenId}

**Type:** String
(Only used if you switch refresh tokens from Postgres to Redis — see context.txt)
**Current decision:** Refresh tokens are stored in Postgres, NOT Redis.
This key is documented here for completeness. Do not implement it unless
you explicitly decide to move token storage to Redis.