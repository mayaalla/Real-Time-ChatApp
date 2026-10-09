import {
  useRef, useState, useEffect, useCallback,
  type ChangeEvent, type KeyboardEvent,
} from "react";
import { v4 as uuidv4 }  from "uuid";
import { Paperclip, Send, X, FileText } from "lucide-react";
import { useAuthStore }  from "../../store/authStore";
import { useDraftStore } from "../../stores/draftStore";
import {type Message }       from "../../api/messages.api";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// The message composer at the bottom of the chat window.
//
// PROPS:
//   conversationId   → which conversation we are in
//   socket           → the Socket.IO socket instance
//   isConnected      → whether the socket is currently connected
//   onOptimisticSend → called immediately when Send is pressed, adds message
//                      as PENDING so it appears instantly in the list
//
// ─────────────────────────────────────────────────────────────────────────────

const API = import.meta.env.VITE_API_URL as string;

// Allowed MIME types — must match the backend's allowed list exactly.
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
  "application/pdf", "text/plain", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_BYTES = 10 * 1024 * 1024;  // 10 MB

interface ComposerProps {
  conversationId: string;
  socket: import("socket.io-client").Socket | null;
  isConnected: boolean;
  onOptimisticSend: (message: Omit<Message, "sender">) => void;
}

export function Composer({
  conversationId,
  socket,
  isConnected,
  onOptimisticSend,
}: ComposerProps) {
  const token       = useAuthStore((s) => s.accessToken)!;
  const currentUser = useAuthStore((s) => s.user)!;
  const getDraft    = useDraftStore((s) => s.getDraft);
  const setDraft    = useDraftStore((s) => s.setDraft);
  const clearDraft  = useDraftStore((s) => s.clearDraft);

  const textareaRef  = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Local state ──────────────────────────────────────────────────────────────
  const [text, setText]                     = useState(() => getDraft(conversationId));
  const [selectedFile, setSelectedFile]     = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadedUrl, setUploadedUrl]       = useState<string | null>(null);
  const [uploadError, setUploadError]       = useState<string | null>(null);

  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef    = useRef(false);
  const lastTypingStartRef = useRef(0);

  // ── Save draft when the user leaves this conversation ────────────────────────
  useEffect(() => {
    const textarea = textareaRef.current;
    return () => {
      if (useAuthStore.getState().user?.id !== currentUser.id) return;
      // This cleanup runs when the component unmounts or conversationId changes.
      const currentText = textarea?.value ?? "";
      if (currentText.trim()) {
        setDraft(conversationId, currentText);
      } else {
        clearDraft(conversationId);
      }
    };
  }, [conversationId, currentUser.id, setDraft, clearDraft]);

  // ── Auto-grow the textarea ───────────────────────────────────────────────────
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // ── Typing events (throttled) ────────────────────────────────────────────────
  const stopTyping = useCallback(() => {
    const wasTyping = isTypingRef.current;
    isTypingRef.current = false;
    lastTypingStartRef.current = 0;
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (socket?.connected && wasTyping) socket.emit("typing:stop", { conversationId });
  }, [socket, conversationId]);

  useEffect(() => () => stopTyping(), [stopTyping]);

  const handleTypingStart = useCallback(() => {
    if (!socket?.connected || !isConnected) return;
    const now = Date.now();
    // Refresh before the backend's five-second TTL while typing continuously.
    if (!isTypingRef.current || now - lastTypingStartRef.current >= 2000) {
      isTypingRef.current = true;
      lastTypingStartRef.current = now;
      socket.emit("typing:start", { conversationId });
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      lastTypingStartRef.current = 0;
      if (socket.connected) socket.emit("typing:stop", { conversationId });
    }, 3000);
  }, [socket, isConnected, conversationId]);

  // ── Text change ──────────────────────────────────────────────────────────────
  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (val.trim()) {
      handleTypingStart();
    } else {
      stopTyping();
    }
  };

  // ── Enter to send, Shift+Enter for new line ──────────────────────────────────
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter: fall through — the browser adds a newline naturally.
  };

  // ── File selection ────────────────────────────────────────────────────────────
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation before touching the network.
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("File type not allowed.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setUploadError("File is too large. Maximum size is 10 MB.");
      return;
    }

    setSelectedFile(file);
    setUploadError(null);
    setUploadedUrl(null);
    setUploadProgress(0);

    // ── STEP 1: Get a signed upload URL from our backend ──────────────────────
    let signData: {
      uploadUrl: string;
      publicUrl: string;
      apiKey: string;
      signature: string;
      timestamp: number;
      folder: string;
      publicId: string;
    };

    try {
      const res = await fetch(`${API}/api/uploads/sign`, {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:  `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          userId:         currentUser.id,
          fileName:       file.name,
          fileType:       file.type,
          fileSize:       file.size,
          conversationId: conversationId,
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      signData = json.data;
    } catch {
      setUploadError("Could not prepare upload. Try again.");
      setUploadProgress(null);
      return;
    }

    // ── STEP 2: Upload DIRECTLY to Cloudinary (NOT through our backend) ────────
    // We use XMLHttpRequest so we can track progress — fetch does not support that.
    const formData = new FormData();
    formData.append("file",       file);
    formData.append("api_key",    signData.apiKey);
    formData.append("signature",  signData.signature);
    formData.append("timestamp",  String(signData.timestamp));
    formData.append("folder",     signData.folder);
    formData.append("public_id",  signData.publicId);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", signData.uploadUrl);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setUploadProgress(Math.round((event.loaded / event.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // STEP 3: Save the permanent public URL to include in the message.
          setUploadedUrl(signData.publicUrl);
          setUploadProgress(null);
          resolve();
        } else {
          reject();
        }
      };

      xhr.onerror = () => reject();
      xhr.send(formData);
    }).catch(() => {
      setUploadError("Upload failed. Please try again.");
      setUploadProgress(null);
    });
  };

  // ── Remove attachment ─────────────────────────────────────────────────────────
  const handleRemoveFile = () => {
    setSelectedFile(null);
    setUploadedUrl(null);
    setUploadProgress(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Send ──────────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    const trimmedText = text.trim();
    if (!trimmedText && !uploadedUrl) return;   // nothing to send
    if (trimmedText.length > 2000) return;      // too long — backend will reject

    // Generate a client-side UUID. This is REQUIRED.
    // NEVER change this ID on retry. The server uses it for safe upsert.
    const messageId = uuidv4();

    const payload = {
      id:             messageId,
      conversationId: conversationId,
      textBody:       trimmedText || undefined,
      attachments:    uploadedUrl ? [uploadedUrl] : [],
    };

    // Optimistic UI: add the message as PENDING immediately so it appears
    // in the list before the server responds.
    onOptimisticSend({
      id:             messageId,
      conversationId: conversationId,
      senderId:       currentUser.id,
      textBody:       trimmedText || null,
      attachments:    uploadedUrl ? [uploadedUrl] : [],
      status:         "PENDING",
      createdAt:      new Date().toISOString(),
      editedAt:       null,
      deletedAt:      null,
    });

    // Emit to socket. If disconnected, socket.io-client will buffer it.
    if (socket) {
      socket.emit("message:send", payload);
    }

    stopTyping();
    setText("");
    clearDraft(conversationId);
    handleRemoveFile();
  }, [
    text, uploadedUrl, conversationId, socket,
    currentUser.id, onOptimisticSend, stopTyping, clearDraft,
  ]);

  const canSend    = (text.trim().length > 0 || uploadedUrl !== null)
                     && uploadProgress === null;
  const isUploading = uploadProgress !== null;

  return (
    <div className="border-t border-border bg-card px-4 py-3 flex flex-col gap-2">

      {/* Disconnected banner */}
      {!isConnected && (
        <div className="text-xs text-center text-muted-foreground bg-muted
                        rounded-lg px-3 py-1.5">
          You are offline — messages will be sent when your connection returns.
        </div>
      )}

      {/* File preview */}
      {selectedFile && (
        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 text-sm">
          <FileText size={16} className="text-muted-foreground shrink-0" />
          <span className="flex-1 truncate text-foreground">{selectedFile.name}</span>

          {/* Progress bar */}
          {isUploading && uploadProgress !== null && (
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {/* Ready indicator */}
          {uploadedUrl && !isUploading && (
            <span className="text-xs text-green-500 font-medium shrink-0">✓ Ready</span>
          )}

          {/* Remove button */}
          <button
            onClick={handleRemoveFile}
            aria-label="Remove attachment"
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <p className="text-xs text-destructive">{uploadError}</p>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">

        {/* Attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a file"
          disabled={isUploading}
          className="text-muted-foreground hover:text-foreground transition-colors
                     disabled:opacity-40 shrink-0 pb-2"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Textarea — grows as you type, max ~5 lines */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? "Message…" : "Offline — message will be queued"}
          rows={1}
          className="flex-1 resize-none bg-secondary text-foreground text-sm
                     rounded-2xl px-4 py-2.5 outline-none
                     placeholder:text-muted-foreground max-h-32 overflow-y-auto
                     leading-relaxed focus:ring-2 focus:ring-ring/50 transition-shadow"
          style={{ height: "auto" }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center
                     bg-primary text-primary-foreground
                     disabled:opacity-40 disabled:cursor-not-allowed
                     hover:opacity-90 transition-opacity mb-0.5"
        >
          <Send size={16} />
        </button>
      </div>

    </div>
  );
}
