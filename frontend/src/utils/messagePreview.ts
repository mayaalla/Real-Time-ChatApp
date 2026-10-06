export function buildPreview(lastMessage: {
    textBody:   string | null;
    deletedAt?: string | null;
  } | null): string {
    if (!lastMessage) return "";
    if (lastMessage.deletedAt) return "Message deleted";
    if (lastMessage.textBody)  return lastMessage.textBody.slice(0, 60);
    return "📎 Attachment";
  }
  
  // Returns "You" if the senderId matches the current user, or the given username.
  export function senderLabel(
    senderId:      string,
    currentUserId: string,
    senderUsername?: string,
  ): string {
    if (senderId === currentUserId) return "You";
    return senderUsername ?? "Unknown";
  }