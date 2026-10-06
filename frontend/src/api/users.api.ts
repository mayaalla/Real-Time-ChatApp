const API = import.meta.env.VITE_API_URL as string;

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
  token: string,
): Promise<PublicUser[]> {
  if (text.trim().length < 2) return [];

  const res = await fetch(
    `${API}/api/users?search=${encodeURIComponent(text.trim())}`,
    {
      headers:     { Authorization: `Bearer ${token}` },
      credentials: "include",
    },
  );

  if (!res.ok) return [];

  const json = await res.json();
  return (json.data ?? []) as PublicUser[];
}
