const API = import.meta.env.VITE_API_URL as string;

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// HTTP calls for conversations: fetch list, fetch one, create.
//
// ─────────────────────────────────────────────────────────────────────────────

// ─── fetchConversations ────────────────────────────────────────────────────────
// Calls GET /api/conversations
// Returns the full conversation list for the logged-in user.
export async function fetchConversations(token: string): Promise<unknown[]> {
  const res = await fetch(`${API}/api/conversations`, {
    headers:     { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) throw new Error("Could not load conversations");
  const json = await res.json();
  return json.data ?? [];
}

// ─── createConversation ───────────────────────────────────────────────────────
// Calls POST /api/conversations
// Rules:
//   DM:    participantIds has exactly 1 ID, isGroup=false, no name.
//   Group: participantIds has 2+ IDs, isGroup=true, name is required.
// If the DM already exists, the backend returns the existing one (idempotent).
export async function createConversation(
  token:          string,
  participantIds: string[],
  isGroup:        boolean,
  name?:          string,
): Promise<{ id: string }> {
  const res = await fetch(`${API}/api/conversations`, {
    method:      "POST",
    headers:     {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${token}`,
    },
    credentials: "include",
    body:        JSON.stringify({ participantIds, isGroup, name }),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json.message ?? "Could not create conversation");
  return json.data;
}
