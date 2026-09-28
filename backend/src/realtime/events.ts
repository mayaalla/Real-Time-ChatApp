export const ClientEvents = {
    CONVERSATION_JOIN:  "conversation:join",
    CONVERSATION_LEAVE: "conversation:leave",
    MESSAGE_SEND:       "message:send",
    MESSAGE_READ:       "message:read",
    MESSAGE_EDIT:       "message:edit",
    MESSAGE_DELETE:     "message:delete",
    TYPING_START:       "typing:start",
    TYPING_STOP:        "typing:stop",
    SYNC_SINCE:         "sync:since",
  } as const;


  export const ServerEvents = {
    MESSAGE_NEW:           "message:new",
    MESSAGE_STATUS:        "message:status",
    TYPING_UPDATE:         "typing:update",
    MESSAGE_EDITED:        "message:edited",
    MESSAGE_DELETED:       "message:deleted",
    PRESENCE_UPDATE:       "presence:update",
    CONVERSATION_CREATED:  "conversation:created",
    ERROR:                 "error",
  } as const;


  export const ConnectionEvents = {
    CONNECT:    "connect",
    DISCONNECT: "disconnect",
  } as const;


  /** Client tells server: "I opened this conversation, add me to its room" */
export interface ConversationJoinPayload {
    conversationId: string;
  }
  
  /** Client tells server: "I left this conversation, remove me from its room" */
  export interface ConversationLeavePayload {
    conversationId: string;
  }
  
  /** Client sends a new message */
  export interface MessageSendPayload {
    id:             string;          // UUID created by the CLIENT (not the server!)
    conversationId: string;
    textBody?:      string;          // optional: text content
    attachments?:   string[];        // optional: array of file URLs
  }
  
  /** Client tells server: "I read up to this message" */
  export interface MessageReadPayload {
    conversationId:    string;
    lastReadMessageId: string;       // the newest message the user actually saw
  }

  export interface MessageEditPayload {
    id: string;
    textBody?: string;
    attachments?: string[];
  }

  export interface MessageDeletePayload {
    id: string;
  }
  
  /** Client is typing */
  export interface TypingStartPayload {
    conversationId: string;
  }
  
  /** Client stopped typing */
  export interface TypingStopPayload {
    conversationId: string;
  }
  
  /** Client asks: "what messages did I miss since this time?" */
  export interface SyncSincePayload {
    conversationId: string;
    since:          string;          // ISO date string
  }

  
  export interface MessageNewPayload {
    message: {
      id:             string;
      conversationId: string;
      senderId:       string;
      textBody:       string | null;
      attachments:    string[];
      status:         string;
      createdAt:      string;
    };
  }
  
  /** Server tells the sender: "your message now has this status" */
  export interface MessageStatusPayload {
    messageId: string;
    status:    "SENT" | "DELIVERED" | "READ";
    userId:    string;               // which user triggered this status change
  }
  
  /** Server tells the conversation room who is currently typing */
  export interface TypingUpdatePayload {
    conversationId: string;
    userId:         string;
    username:       string;
    isTyping:       boolean;
  }
  
  /** Server tells relevant users someone's online status changed */
  export interface PresenceUpdatePayload {
    userId:   string;
    online:   boolean;
    lastSeen: string | null;         // ISO date string, or null if never seen
  }
  
  /** Server tells a user a new conversation was created that they are part of */
  export interface ConversationCreatedPayload {
    conversation: {
      id:        string;
      isGroup:   boolean;
      name:      string | null;
      createdAt: string;
    };
  }
  
  /** Server sends an error back to a specific socket */
  export interface ErrorPayload {
    code:    string;                 // example: "NOT_MEMBER", "VALIDATION_ERROR"
    message: string;                 // human-readable explanation
  }