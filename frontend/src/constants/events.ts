export const ClientEvents = {
    CONVERSATION_JOIN:  "conversation:join",
    CONVERSATION_LEAVE: "conversation:leave",
    MESSAGE_SEND:       "message:send",
    MESSAGE_READ:       "message:read",
    TYPING_START:       "typing:start",
    TYPING_STOP:        "typing:stop",
    SYNC_SINCE:         "sync:since",
    PRESENCE_FETCH:     "presence:fetch",
  } as const;
  
  // Events YOU receive (server → client)
  export const ServerEvents = {
    MESSAGE_NEW:            "message:new",
    MESSAGE_STATUS:         "message:status",
    TYPING_UPDATE:          "typing:update",
    PRESENCE_UPDATE:        "presence:update",
    PRESENCE_SNAPSHOT:      "presence:snapshot",
    CONVERSATION_CREATED:   "conversation:created",
    CONVERSATION_JOINED:    "conversation:joined",
    CONVERSATION_UNREAD:    "conversation:unread_count",
    SYNC_MESSAGES:          "sync:messages",
    SYNC_RELOAD:            "sync:reload",
    CONNECT:                "connect",
    DISCONNECT:             "disconnect",
    CONNECT_ERROR:          "connect_error",
    RECONNECT_ATTEMPT:      "reconnect_attempt",
    RECONNECT:              "reconnect",
    ERROR:                  "error",
  } as const;