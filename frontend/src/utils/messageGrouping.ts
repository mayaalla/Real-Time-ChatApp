import { isToday, isYesterday, format, differenceInMinutes } from "date-fns";
import { Message } from "../api/messages.api";

// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//
// Turns a flat sorted list of Messages (oldest first) into a display list
// that includes date dividers and grouping metadata for consecutive runs.
//
// OUTPUT: An array of GroupItem objects. Each item is one of:
//   { type: "date-divider", label: "Today" / "Yesterday" / "6 Oct 2026" }
//   { type: "message", message, isOwn, showSenderInfo }
//
// showSenderInfo = true on the FIRST message of a consecutive run from the
// same sender. A run breaks when:
//   - The sender changes.
//   - More than 5 minutes pass between two messages from the same sender.
//   - A date divider is inserted (day change resets the run).
//
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RUN_MINUTES = 5;

export type GroupItem =
  | { type: "date-divider"; label: string }
  | { type: "message"; message: Message; isOwn: boolean; showSenderInfo: boolean };

function formatDividerLabel(date: Date): string {
  if (isToday(date))     return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMM yyyy");   // e.g. "2 Oct 2026"
}

export function buildMessageGroups(
  messages: Message[],
  currentUserId?: string
): GroupItem[] {
  const result: GroupItem[] = [];
  let lastDateStr: string | null  = null;
  let lastSenderId: string | null = null;
  let lastTimestamp: Date | null  = null;
  let runBroken = true;

  for (const msg of messages) {
    const date    = new Date(msg.createdAt);
    const dateStr = format(date, "yyyy-MM-dd");

    // ── Insert a date divider when the day changes ────────────────────────────
    if (dateStr !== lastDateStr) {
      result.push({ type: "date-divider", label: formatDividerLabel(date) });
      lastDateStr = dateStr;
      runBroken   = true;   // a new day always starts a new run
    }

    // ── Decide if this is the first message of a new run ──────────────────────
    const senderChanged = msg.senderId !== lastSenderId;
    const tooMuchTime   =
      lastTimestamp !== null &&
      differenceInMinutes(date, lastTimestamp) > MAX_RUN_MINUTES;

    const showSenderInfo = runBroken || senderChanged || tooMuchTime;

    runBroken     = false;
    lastSenderId  = msg.senderId;
    lastTimestamp = date;

    result.push({
      type:           "message",
      message:        msg,
      isOwn:          msg.senderId === currentUserId,
      showSenderInfo,
    });
  }

  return result;
}
