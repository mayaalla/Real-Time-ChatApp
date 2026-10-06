import { format } from "date-fns";
import { Download } from "lucide-react";
import { Message } from "../../api/messages.api";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Renders ONE message bubble. Handles:
//   - Own vs other alignment and colour
//   - Deleted message placeholder
//   - Edited indicator
//   - Status ticks (own messages only)
//   - Image attachments (thumbnail that opens the full image in a new tab)
//   - File attachments (card with filename + download link)
//   - Sender name + avatar for group chats (first bubble of a run only)
//
// ─────────────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  showSenderInfo: boolean;
  isGroup: boolean;
}

// ── Status ticks ──────────────────────────────────────────────────────────────
function StatusTick({ status }: { status: Message["status"] }) {
  if (status === "PENDING")   return <span className="text-[10px] text-muted-foreground/60">⏳</span>;
  if (status === "FAILED")    return <span className="text-[10px] text-destructive">!</span>;
  if (status === "SENT")      return <span className="text-[10px] text-muted-foreground">✓</span>;
  if (status === "DELIVERED") return <span className="text-[10px] text-muted-foreground">✓✓</span>;
  if (status === "READ")      return <span className="text-[10px] text-blue-400">✓✓</span>;
  return null;
}

// ── Guess if a URL is an image ────────────────────────────────────────────────
function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
}

// ── Extract a filename from a URL ─────────────────────────────────────────────
function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").pop() ?? "file");
  } catch {
    return "file";
  }
}

export function MessageBubble({
  message,
  isOwn,
  showSenderInfo,
  isGroup,
}: MessageBubbleProps) {
  const isDeleted = message.deletedAt !== null;
  const isEdited  = !isDeleted && message.editedAt !== null;
  const time      = format(new Date(message.createdAt), "HH:mm");

  return (
    <div
      className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"} ${
        showSenderInfo ? "mt-3" : "mt-0.5"
      }`}
    >
      {/* Avatar column — groups only, other people's messages only */}
      {isGroup && !isOwn && (
        <div className="w-7 shrink-0 self-end mb-1">
          {showSenderInfo && message.sender && (
            message.sender.avatarAddress ? (
              <img
                src={message.sender.avatarAddress}
                alt={message.sender.username}
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center
                              justify-center text-xs font-semibold text-secondary-foreground">
                {message.sender.username.charAt(0).toUpperCase()}
              </div>
            )
          )}
        </div>
      )}

      {/* Bubble column */}
      <div className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}>

        {/* Sender name — groups, first message of run, not own */}
        {isGroup && !isOwn && showSenderInfo && message.sender && (
          <p className="text-xs text-muted-foreground font-medium mb-1 ml-1">
            {message.sender.username}
          </p>
        )}

        {/* The bubble */}
        <div
          className={`rounded-2xl px-3 py-2 text-sm leading-relaxed ${
            isOwn
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-secondary text-secondary-foreground rounded-bl-sm"
          }`}
        >
          {isDeleted ? (
            <span className="italic opacity-60 text-xs">Message deleted</span>
          ) : (
            <>
              {/* Attachments */}
              {message.attachments.length > 0 && (
                <div className="flex flex-col gap-2 mb-1">
                  {message.attachments.map((url) =>
                    isImageUrl(url) ? (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt="attachment"
                          className="max-w-[240px] rounded-xl object-cover cursor-pointer
                                     hover:opacity-90 transition-opacity"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <a
                        key={url}
                        href={url}
                        download
                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs
                                   font-medium no-underline transition-opacity hover:opacity-80 ${
                                     isOwn
                                       ? "bg-white/20 text-primary-foreground"
                                       : "bg-background text-foreground border border-border"
                                   }`}
                      >
                        <Download size={14} className="shrink-0" />
                        <span className="truncate max-w-[160px]">
                          {filenameFromUrl(url)}
                        </span>
                      </a>
                    )
                  )}
                </div>
              )}

              {/* Message text */}
              {message.textBody && (
                <p className="whitespace-pre-wrap break-words">{message.textBody}</p>
              )}
            </>
          )}

          {/* Time + edited label + status ticks */}
          <div
            className={`flex items-center gap-1 mt-1 ${
              isOwn ? "justify-end" : "justify-start"
            }`}
          >
            {isEdited && (
              <span
                className={`text-[10px] ${
                  isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
                }`}
              >
                edited
              </span>
            )}
            <span
              className={`text-[10px] ${
                isOwn ? "text-primary-foreground/60" : "text-muted-foreground"
              }`}
            >
              {time}
            </span>
            {isOwn && !isDeleted && <StatusTick status={message.status} />}
          </div>
        </div>
      </div>
    </div>
  );
}
