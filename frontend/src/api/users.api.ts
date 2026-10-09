import { api } from "../lib/axios";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// HTTP calls related to users (search, fetch current user).
// We keep these separate from auth calls for clarity.
//
// ─────────────────────────────────────────────────────────────────────────────

export interface PublicUser {
  id:            string;
  username:      string;
  avatarAddress: string | null;
  lastSeen:      string | null;
}

// ─── searchUsers ───────────────────────────────────────────────────────────────
// Calls GET /api/users?search=<text>
// The backend requires at least 2 characters in the search string.
// Returns an empty array if the search is too short or returns nothing.
export async function searchUsers(
  text:  string,
  _token: string,
  signal?: AbortSignal,
): Promise<PublicUser[]> {
  if (text.trim().length < 2) return [];

  // Use the shared client so expired access tokens are refreshed automatically.
  const { data } = await api.get<{ ok: boolean; data: { users: PublicUser[] } }>(
    "/api/users",
    { params: { search: text.trim() }, signal },
  );
  return data.data.users;
}
