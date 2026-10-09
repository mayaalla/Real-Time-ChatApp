import { MessageSquare, Search, AlertCircle, RefreshCw } from "lucide-react";

// ─── WHAT THIS COMPONENT DOES ─────────────────────────────────────────────────
//
// A reusable empty/error state component.
// Use it whenever there is nothing to show, or when something went wrong.
//
// VARIANTS:
//   "no-conversations"  → "No conversations yet. Start one!"
//   "no-messages"       → "No messages yet. Say hello!"
//   "no-results"        → "No results found for '...'"
//   "error"             → "Something went wrong." with an optional retry button
//
// HOW TO USE:
//   <EmptyState variant="no-conversations" />
//   <EmptyState variant="error" onRetry={() => refetch()} />
//   <EmptyState variant="no-results" searchTerm="alice" />
//
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  variant:     "no-conversations" | "no-messages" | "no-results" | "error";
  searchTerm?: string;      // used when variant = "no-results"
  onRetry?:    () => void;  // used when variant = "error"
}

export function EmptyState({ variant, searchTerm, onRetry }: EmptyStateProps) {

  // ── Content based on variant ─────────────────────────────────────────────────
  const content = {
    "no-conversations": {
      icon:    <MessageSquare size={40} className="text-muted-foreground/40" />,
      title:   "No conversations yet",
      message: "Click the + button to start a new chat.",
      action:  null,
    },
    "no-messages": {
      icon:    <MessageSquare size={40} className="text-muted-foreground/40" />,
      title:   "No messages yet",
      message: "Be the first to say hello! 👋",
      action:  null,
    },
    "no-results": {
      icon:    <Search size={40} className="text-muted-foreground/40" />,
      title:   "No results found",
      message: searchTerm
               ? `We couldn't find anyone matching "${searchTerm}".`
               : "Try a different search term.",
      action:  null,
    },
    "error": {
      icon:    <AlertCircle size={40} className="text-destructive/60" />,
      title:   "Something went wrong",
      message: "We couldn't load this content. Please try again.",
      action:  onRetry ? (
        <button
          onClick={onRetry}
          className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl
                     bg-primary text-primary-foreground text-sm font-medium
                     hover:opacity-90 transition-opacity"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      ) : null,
    },
  }[variant];

  // Safety net: unknown variant → render nothing instead of crashing
  if (!content) return null;

  return (
    <div className="flex flex-col items-center justify-center flex-1
                    text-center px-6 py-12 select-none">
      <div className="mb-4">{content.icon}</div>
      <p className="text-base font-semibold text-foreground">{content.title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{content.message}</p>
      {content.action}
    </div>
  );
}