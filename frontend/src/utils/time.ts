import {
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
  format,
  differenceInMinutes,
  differenceInSeconds,
} from "date-fns";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Converts ISO date strings into friendly human-readable relative time strings.
//
// relativeTime() — used in conversation list preview timestamps
//   "5 min ago", "22 hrs ago", "5 days ago"
//
// lastSeenText() — used in the chat header presence line
//   "last seen just now"
//   "last seen 10 minutes ago"
//   "last seen yesterday at 21:14"
//   "last seen Mon at 09:30"
//
// ─────────────────────────────────────────────────────────────────────────────

// ── relativeTime ──────────────────────────────────────────────────────────────
// Short relative time for conversation list timestamps.
export function relativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    return formatDistanceToNowStrict(new Date(isoString), { addSuffix: true });
  } catch {
    return "";
  }
}

// ── lastSeenText ──────────────────────────────────────────────────────────────
// Friendly "last seen …" text for the chat header.
// Returns just the time description (without the "last seen" prefix),
// so the caller can prepend it if needed.
export function lastSeenText(isoString: string | null | undefined): string {
  if (!isoString) return "a long time ago";
  try {
    const date    = new Date(isoString);
    const nowDate = new Date();

    const secondsAgo = differenceInSeconds(nowDate, date);
    const minutesAgo = differenceInMinutes(nowDate, date);

    // Less than 1 minute ago → "just now"
    if (secondsAgo < 60) return "just now";

    // Less than 1 hour → "10 minutes ago"
    if (minutesAgo < 60) return `${minutesAgo} minute${minutesAgo === 1 ? "" : "s"} ago`;

    // Today → "today at 14:32"
    if (isToday(date)) return `today at ${format(date, "HH:mm")}`;

    // Yesterday → "yesterday at 21:14"
    if (isYesterday(date)) return `yesterday at ${format(date, "HH:mm")}`;

    // Within the last week → "Mon at 09:30"
    const daysAgo = Math.floor(secondsAgo / 86400);
    if (daysAgo < 7) return `${format(date, "EEE")} at ${format(date, "HH:mm")}`;

    // Older → "12 Oct at 09:30"
    return `${format(date, "d MMM")} at ${format(date, "HH:mm")}`;
  } catch {
    return "a long time ago";
  }
}