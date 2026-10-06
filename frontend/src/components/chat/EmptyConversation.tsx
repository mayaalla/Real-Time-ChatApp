// Shown when the conversation has zero messages (brand-new chat).
export function EmptyConversation({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-3
                    text-center px-8 text-muted-foreground">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center
                      justify-center text-3xl">
        💬
      </div>
      <p className="font-semibold text-foreground">Start the conversation</p>
      <p className="text-sm">
        This is the beginning of your chat with <strong>{name}</strong>.
        Say hello!
      </p>
    </div>
  );
}
