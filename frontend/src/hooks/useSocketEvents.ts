import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socket }                        from "../lib/socket";
import { ServerEvents }                  from "../constants/events";
import { useAuthStore }                  from "../stores/authStore";
import { useTypingStore }                from "../stores/typingStore";
import { usePresenceStore }              from "../stores/presenceStore";
import { useConversationStore } from "../store/conversationStore";
import {
  replaceOrAppendMessageInCache,
  updateMessageStatusInCache,
  updateMessageInCache,
} from "../utils/messageCache";
import { type Message } from "../api/messages.api";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Registers every server-to-client event listener in ONE place.
// Removes them all on unmount — prevents the "message appears 3 times
// after 3 hot-reloads" bug.
//
// Mount this hook ONCE alongside useSocketConnection in your root component.
//
// ─────────────────────────────────────────────────────────────────────────────

export function useSocketEvents() {
  const queryClient    = useQueryClient();
  const currentUser    = useAuthStore((s) => s.user);
  const setTyping      = useTypingStore((s) => s.setTyping);
  const setPresence    = usePresenceStore((s) => s.setPresence);
  const setPresenceMap = usePresenceStore((s) => s.setPresenceMap);

  useEffect(() => {

    // ── message:new ──────────────────────────────────────────────────────────
    // RULE 2: write into React Query cache, not into component state.
    // RULE 4: de-duplicate by ID (done inside replaceOrAppendMessageInCache).
    function onMessageNew({ message }: { message: Message }) {
      // replaceOrAppendMessageInCache checks if this ID already exists
      // (as a PENDING optimistic message). If yes -> replace in place.
      // If no -> append as a new message. In both cases, no duplicate is created.
      replaceOrAppendMessageInCache(queryClient, message);
      if (currentUser?.id && message.senderId !== currentUser.id && socket.connected) {
        socket.emit("message:delivered", { messageId: message.id });
      }

      // Invalidate the conversation list so its "last message" preview updates.
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }

    // ── message:status ────────────────────────────────────────────────────────
    function onMessageStatus({
      messageId,
      status,
      conversationId,
    }: {
      messageId:      string;
      status:         Message["status"];
      userId:         string;
      conversationId: string;
    }) {
      updateMessageStatusInCache(queryClient, conversationId, messageId, status);
    }

    function onMessageChanged({ message }: { message: Message }) {
      updateMessageInCache(queryClient, message);
      useConversationStore.getState().updateMessagePreview(message);
    }

    // ── typing:update ─────────────────────────────────────────────────────────
    // RULE 3: typing info goes into Zustand, not React Query.
    function onTypingUpdate({
      conversationId,
      typerIds,
    }: {
      conversationId: string;
      typerIds: string[];
    }) {
      // Filter out ourselves — we only show OTHERS typing.
      const others = typerIds.filter((id) => id !== currentUser?.id);
      setTyping(conversationId, others);
    }

    // ── presence:update ───────────────────────────────────────────────────────
    // RULE 3: presence info goes into Zustand.
    function onPresenceUpdate({
      userId,
      online,
      lastSeen,
    }: {
      userId:   string;
      online:   boolean;
      lastSeen: string | null;
    }) {
      setPresence(userId, { online, lastSeen });
    }

    // ── presence:snapshot ─────────────────────────────────────────────────────
    // Full snapshot sent by the server right after we connect.
    function onPresenceSnapshot(
      list: Array<{ userId: string; online: boolean; lastSeen?: string | null }>
    ) {
      const map = new Map(
        list.map(({ userId, online, lastSeen }) => [
          userId,
          { online, lastSeen: lastSeen ?? null },
        ])
      );
      setPresenceMap(map);
    }

    // ── conversation:created ──────────────────────────────────────────────────
    function onConversationCreated() {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }

    // ── sync:messages ─────────────────────────────────────────────────────────
    // After reconnect, the server sends us messages we missed while offline.
    function onSyncMessages({
      conversationId,
      messages,
    }: {
      conversationId: string;
      messages: Message[];
    }) {
      for (const message of messages) {
        replaceOrAppendMessageInCache(queryClient, {
          ...message,
          conversationId,
        });
      }
    }

    // ── sync:reload ───────────────────────────────────────────────────────────
    // We missed too many messages. Re-fetch from REST.
    function onSyncReload({ conversationId }: { conversationId: string }) {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    }

    // ── error ─────────────────────────────────────────────────────────────────
    function onError({ code, message }: { code: string; message: string }) {
      console.error(`[Socket error] ${code}: ${message}`);
      // Add a toast notification here if you have a toast library.
    }

    // ── Register ALL listeners ────────────────────────────────────────────────
    socket.on(ServerEvents.MESSAGE_NEW,          onMessageNew);
    socket.on(ServerEvents.MESSAGE_STATUS,       onMessageStatus);
    socket.on(ServerEvents.MESSAGE_EDITED,       onMessageChanged);
    socket.on(ServerEvents.MESSAGE_DELETED,      onMessageChanged);
    socket.on(ServerEvents.TYPING_UPDATE,        onTypingUpdate);
    socket.on(ServerEvents.PRESENCE_UPDATE,      onPresenceUpdate);
    socket.on(ServerEvents.PRESENCE_SNAPSHOT,    onPresenceSnapshot);
    socket.on(ServerEvents.CONVERSATION_CREATED, onConversationCreated);
    socket.on(ServerEvents.SYNC_MESSAGES,        onSyncMessages);
    socket.on(ServerEvents.SYNC_RELOAD,          onSyncReload);
    socket.on(ServerEvents.ERROR,                onError);

    // ── Cleanup: REMOVE ALL listeners on unmount ──────────────────────────────
    // THIS IS THE MOST CRITICAL STEP IN THIS WHOLE FILE.
    //
    // Without this, every hot-reload (file save in your editor) adds a new
    // copy of every listener to the same socket. After 3 saves you have 3
    // onMessageNew handlers — every new message appears 3 times.
    // The socket.off() calls below prevent that completely.
    return () => {
      socket.off(ServerEvents.MESSAGE_NEW,          onMessageNew);
      socket.off(ServerEvents.MESSAGE_STATUS,       onMessageStatus);
      socket.off(ServerEvents.MESSAGE_EDITED,       onMessageChanged);
      socket.off(ServerEvents.MESSAGE_DELETED,      onMessageChanged);
      socket.off(ServerEvents.TYPING_UPDATE,        onTypingUpdate);
      socket.off(ServerEvents.PRESENCE_UPDATE,      onPresenceUpdate);
      socket.off(ServerEvents.PRESENCE_SNAPSHOT,    onPresenceSnapshot);
      socket.off(ServerEvents.CONVERSATION_CREATED, onConversationCreated);
      socket.off(ServerEvents.SYNC_MESSAGES,        onSyncMessages);
      socket.off(ServerEvents.SYNC_RELOAD,          onSyncReload);
      socket.off(ServerEvents.ERROR,                onError);
    };
  }, [queryClient, currentUser, setTyping, setPresence, setPresenceMap]);
}
