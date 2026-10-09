import { useEffect, useState } from "react";
import { socket } from "../lib/socket";
import { ClientEvents, ServerEvents } from "../constants/events";
import { useConnectionStore } from "../store/connectionStore";

export function useRoomManager(conversationId: string) {
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const status = useConnectionStore((s) => s.status);

  useEffect(() => {
    if (!conversationId || status !== "connected" || !socket.connected) return;

    function onJoined({ conversationId: id }: { conversationId: string }) {
      if (id === conversationId) setJoinedId(id);
    }
    // Install the listener before emitting; don't buffer room changes while offline.
    socket.on(ServerEvents.CONVERSATION_JOINED, onJoined);
    socket.emit(ClientEvents.CONVERSATION_JOIN, { conversationId });
    return () => {
      socket.off(ServerEvents.CONVERSATION_JOINED, onJoined);
      if (socket.connected) socket.emit(ClientEvents.CONVERSATION_LEAVE, { conversationId });
      setJoinedId(null);
    };
  }, [conversationId, status]);

  return { isJoined: status === "connected" && joinedId === conversationId };
}
