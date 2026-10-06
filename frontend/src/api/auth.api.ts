const API = import.meta.env.VITE_API_URL as string;

// ─── refreshSession ────────────────────────────────────────────────────────────
// Calls POST /api/auth/refresh.
// The browser automatically sends the HttpOnly cookie — no manual work needed.
// Returns the new access token on success, or throws on failure.
export async function refreshSession(): Promise<string> {
    const res = await fetch(`${API}/api/auth/refresh`, {
      method:      "POST",
      credentials: "include",   // ← THIS IS CRITICAL. It tells the browser to send cookies.
    });
  
    if (!res.ok) {
      throw new Error("Refresh failed");
    }
  
    const json = await res.json();
    return json.data.accessToken as string;
  }

  // ─── fetchMe ──────────────────────────────────────────────────────────────────
// Calls GET /api/users/me with the given access token.
// Returns the logged-in user's public profile.
export async function fetchMe(token: string): Promise<{
    id: string;
    username: string;
    avatarAddress: string | null;
    lastSeen: string | null;
  }> {
    const res = await fetch(`${API}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,   // ← Every protected request needs this
      },
      credentials: "include",
    });
  
    if (!res.ok) {
      throw new Error("Could not fetch user");
    }
  
    const json = await res.json();
    return json.data;
  }
  
  // ─── loginUser ────────────────────────────────────────────────────────────────
  // Calls POST /api/auth/login.
  // The backend accepts either email+password or username+password.
  export async function loginUser(credentials: {
    email?: string;
    username?: string;
    password: string;
  }): Promise<{ user: { id: string; username: string; avatarAddress: string | null; lastSeen: string | null }; accessToken: string }> {
    const res = await fetch(`${API}/api/auth/login`, {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",   // ← lets the browser store the refresh cookie
      body:        JSON.stringify(credentials),
    });
  
    const json = await res.json();
  
    if (!json.ok) {
      // The server sends back { ok: false, message: "...", code: "..." }
      // We throw the message so the UI can display it to the user.
      throw new Error(json.message ?? "Login failed");
    }
  
    return json.data;
  }
  
  // ─── registerUser ─────────────────────────────────────────────────────────────
  // Calls POST /api/auth/register.
  export async function registerUser(data: {
    email: string;
    username: string;
    password: string;
  }): Promise<{ user: { id: string; username: string; avatarAddress: string | null; lastSeen: string | null }; accessToken: string }> {
    const res = await fetch(`${API}/api/auth/register`, {
      method:      "POST",
      headers:     { "Content-Type": "application/json" },
      credentials: "include",
      body:        JSON.stringify(data),
    });
  
    const json = await res.json();
  
    if (!json.ok) {
      throw new Error(json.message ?? "Registration failed");
    }
  
    return json.data;
  }
  
  // ─── logoutUser ───────────────────────────────────────────────────────────────
  // Calls POST /api/auth/logout.
  // The server clears the refresh cookie. Returns nothing (204 No Content).
  export async function logoutUser(token: string): Promise<void> {
    await fetch(`${API}/api/auth/logout`, {
      method:      "POST",
      headers:     { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    // We do not throw even if it fails — logout is "best effort".
    // The important thing is clearing the local state (done in Step 20.5).
  }