// ─── MessageListSkeleton ──────────────────────────────────────────────────────
// Shown while the first page of messages is loading.
// Renders fake grey bubbles to avoid a blank white screen.
// ─────────────────────────────────────────────────────────────────────────────

export function MessageListSkeleton() {
  const rows = [
    { side: "left",  width: "60%" },
    { side: "right", width: "40%" },
    { side: "left",  width: "75%" },
    { side: "right", width: "55%" },
    { side: "left",  width: "50%" },
    { side: "right", width: "65%" },
  ];

  return (
    <div className="flex flex-col gap-3 px-4 py-6 animate-pulse">
      {rows.map((row, i) => (
        <div
          key={i}
          className={`flex ${row.side === "right" ? "justify-end" : "justify-start"}`}
        >
          <div
            className="h-10 rounded-2xl bg-muted"
            style={{ width: row.width }}
          />
        </div>
      ))}
    </div>
  );
}
