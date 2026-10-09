import { useRef, useEffect, useState } from "react";
import { format } from "date-fns";
import { Download, Pencil, Trash2 } from "lucide-react";
import { isAxiosError } from "axios";
import { editMessage, deleteMessage, type Message } from "../../api/messages.api";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// Renders ONE message bubble. Handles:
//   - Own vs other alignment and colour
//   - Deleted message placeholder
//   - Edited indicator
//   - Status ticks (own messages only):
//       ⏳ = PENDING   (optimistic, not confirmed by server yet)
//       ✓  = SENT      (server saved it)
//       ✓✓ = DELIVERED (recipient device received it)
//       ✓✓ = READ      (recipient saw it — shown in blue)
//       ⚠  = FAILED    (send failed)
//   - Image attachments (thumbnail → opens full in new tab)
//   - File attachments (card with download link)
//   - Sender name + avatar on every group message
//   - Intersection observation for read receipts (other people's messages only)
//
// ─────────────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message:        Message;
  isOwn:          boolean;
  showSenderInfo: boolean;
  isGroup:        boolean;
  onMessageChange: (message: Message) => void;
  // Only pass these for OTHER people's messages (not your own).
  // useReadReceipts uses them to track which messages are visible in the viewport.
  onVisible?: (messageId: string, el: Element | null) => void;
  onHidden?:  (messageId: string, el: Element | null) => void;
}

// ── StatusTick ────────────────────────────────────────────────────────────────
// Shows the delivery/read status for YOUR OWN messages.
// aria-label makes this accessible to screen readers.
function StatusTick({ status }: { status: Message["status"] }) {
  if (status === "PENDING")
    return <span className="text-[10px] text-muted-foreground/60" aria-label="Sending">⏳</span>;
  if (status === "FAILED")
    return <span className="text-[10px] text-destructive" aria-label="Failed to send">⚠</span>;
  if (status === "SENT")
    return <span className="text-[10px] text-muted-foreground" aria-label="Sent">✓</span>;
  if (status === "DELIVERED")
    return <span className="text-[10px] text-muted-foreground" aria-label="Delivered">✓✓</span>;
  if (status === "READ")
    return <span className="text-[10px] text-blue-400" aria-label="Read">✓✓</span>;
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
  onMessageChange,
  onVisible,
  onHidden,
}: MessageBubbleProps) {
  const isDeleted = !!message.deletedAt;
  const isEdited  = !isDeleted && !!message.editedAt;
  const time      = format(new Date(message.createdAt), "HH:mm");
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const canChange = isOwn && !isDeleted && message.status !== "PENDING" && message.status !== "FAILED";

  const cancelAction = () => { setMode("view"); setActionError(null); };
  const submitChange = async (action: "edit" | "delete") => {
    if (isSaving || !canChange) return;
    setIsSaving(true);
    setActionError(null);
    try {
      const updated = action === "edit" ? await editMessage(message.id, editText.trim()) :
        await deleteMessage(message.id);
      onMessageChange(updated);
      setMode("view");
    } catch (error) {
      const serverMessage = isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
      setActionError(serverMessage ?? `Could not ${action} this message. Please try again.`);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Intersection observation for read receipts ─────────────────────────────
  // We attach the ref only to OTHER people's messages.
  // data-message-id and data-message-time are read by the IntersectionObserver
  // in useReadReceipts without needing closure over stale values.
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOwn || !onVisible) return;
    const el = bubbleRef.current;
    if (!el) return;

    onVisible(message.id, el);
    return () => {
      onHidden?.(message.id, el);
    };
  }, [message.id, isOwn, onVisible, onHidden]);

  return (
    <div
      className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : "flex-row"} ${
        showSenderInfo ? "mt-3" : "mt-0.5"
      }`}
    >
      {/* Bubble column */}
      <div
        ref={bubbleRef}
        // data-* attributes are read by the IntersectionObserver inside useReadReceipts.
        // Storing them on the DOM element avoids stale-closure issues.
        data-message-id={message.id}
        data-message-time={message.createdAt}
        className={`flex flex-col max-w-[70%] ${isOwn ? "items-end" : "items-start"}`}
      >

        {/* Identify every group message, including our own and consecutive sends. */}
        {isGroup && message.sender && (
          <div className="flex items-center gap-2 mb-1.5 min-w-0 max-w-full">
            {message.sender.avatarAddress ? (
              <img
                src={message.sender.avatarAddress}
                alt={`${message.sender.username}'s profile picture`}
                className="w-7 h-7 rounded-full object-cover shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-secondary flex items-center
                              justify-center text-xs font-semibold text-secondary-foreground shrink-0"
                   aria-label={`${message.sender.username}'s avatar`}>
                {message.sender.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs text-muted-foreground font-medium truncate">
              {message.sender.username}
            </span>
          </div>
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
              {(message.attachments?.length ?? 0) > 0 && (
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

              {/* Message text — break-all ensures very long words (URLs) wrap */}
              {canChange && mode === "edit" ? (
                <form onSubmit={(event) => { event.preventDefault(); void submitChange("edit"); }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape" && !isSaving) { event.preventDefault(); cancelAction(); }
                      }}>
                  <textarea
                    autoFocus
                    aria-label="Edit message"
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    maxLength={2000}
                    rows={3}
                    disabled={isSaving}
                    className="block rounded-lg border border-input bg-background text-foreground
                               p-2 text-sm resize-y outline-none focus:ring-2 focus:ring-ring"
                    style={{ width: "min(16rem, 50vw)" }}
                  />
                  <div className="flex items-center justify-end gap-2 mt-2">
                    <button type="button" disabled={isSaving} onClick={cancelAction}
                            className="rounded-md px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50">Cancel</button>
                    <button type="submit"
                            disabled={isSaving || !editText.trim() || editText.trim() === message.textBody}
                            className="rounded-md bg-background text-foreground px-3 py-1 text-xs font-medium
                                       hover:bg-accent disabled:opacity-50">
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              ) : message.textBody && (
                <p className="whitespace-pre-wrap break-words break-all">
                  {message.textBody}
                </p>
              )}
            </>
          )}

          {canChange && mode === "delete" && (
            <div className="mt-2 pt-2 border-t border-current/20" role="group" aria-label="Confirm message deletion">
              <p className="text-xs">Delete this message for everyone?</p>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" disabled={isSaving} onClick={cancelAction}
                        className="rounded-md px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-50">Cancel</button>
                <button type="button" disabled={isSaving} onClick={() => void submitChange("delete")}
                        className="rounded-md bg-destructive text-white px-3 py-1 text-xs font-medium
                                   hover:opacity-90 disabled:opacity-50">
                  {isSaving ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          )}
          {!isDeleted && actionError && <p role="alert" className="mt-2 text-xs text-destructive">{actionError}</p>}

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
            {canChange && mode === "view" && (
              <div className="flex items-center gap-1 ml-2">
                {message.textBody && (
                  <button type="button" title="Edit message" aria-label="Edit message"
                          onClick={() => { setEditText(message.textBody ?? ""); setActionError(null); setMode("edit"); }}
                          className="rounded-md p-1 opacity-70 hover:opacity-100 hover:bg-white/10 focus-visible:outline-2">
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                )}
                <button type="button" title="Delete message" aria-label="Delete message"
                        onClick={() => { setActionError(null); setMode("delete"); }}
                        className="rounded-md p-1 opacity-70 hover:opacity-100 hover:bg-white/10 focus-visible:outline-2">
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
