import { formatDistanceToNowStrict } from "date-fns";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Converts an ISO date string into a short, friendly relative time.
// Examples:
//   "2026-10-06T07:55:00Z"  → "5 min ago"
//   "2026-10-05T10:00:00Z"  → "22 hrs ago"
//   "2026-10-01T10:00:00Z"  → "5 days ago"
//
// We use date-fns because it handles edge cases (timezones, plurals) for us.
//
// ─────────────────────────────────────────────────────────────────────────────

export function relativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    return formatDistanceToNowStrict(new Date(isoString), { addSuffix: true });
  } catch {
    return "";
  }
}