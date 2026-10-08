import { useQueryClient }        from "@tanstack/react-query";
import { appendMessageToCache }  from "../../utils/messageCache";
import { type Message }               from "../../api/messages.api";
import { socket }                from "../../lib/socket";
import { useConnectionStore }    from "../../store/connectionStore";
import { Composer }              from "./Composer";
import { MessageList }           from "./MessageList";
import { ChatHeader }            from "./ChatHeader";
import { useRoomManager } from "../../hooks/useRoomManager";

// ─── Prop types ───────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  username: string;
  avatarAddress: string | null;
  lastSeen: string | null;
}

interface Conversation {
  id: string;
  isGroup: boolean;
  displayName: string;
  displayPicture: string | null;
  participants: Participant[];
}

interface ChatWindowProps {
  conversationId: string;
  conversation: Conversation;
}

export function ChatWindow({ conversationId, conversation }: ChatWindowProps) {
  const queryClient = useQueryClient();
  const status      = useConnectionStore((s) => s.status);
  const { isJoined } = useRoomManager(conversationId);

  if (!isJoined) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Joining conversation...
      </div>
    );
  }

  // Called by the Composer immediately when the user presses Send.
  // Writes the PENDING message into the React Query cache so it appears
  // instantly. When the server confirms it, onMessageNew replaces it.
  function handleOptimisticSend(message: Omit<Message, "sender">) {
    appendMessageToCache(queryClient, message as Message);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <ChatHeader conversation={conversation} />
      <MessageList conversationId={conversationId}
                   conversationName={conversation.displayName}
                   isGroup={conversation.isGroup}
                   liveMessages={[]}   // <- empty: live messages now go into cache
      />
      <Composer
        conversationId={conversationId}
        socket={socket}
        isConnected={status === "connected"}
        onOptimisticSend={handleOptimisticSend}
      />
    </div>
  );
}