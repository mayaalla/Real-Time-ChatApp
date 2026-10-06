import { useState, useEffect } from "react";

// ─── WHAT THIS HOOK DOES ──────────────────────────────────────────────────────
//
// Returns a "debounced" version of a value.
// The debounced value only updates AFTER the user has stopped changing it
// for `delay` milliseconds.
//
// Example:
//   const [search, setSearch] = useState("");
//   const debouncedSearch = useDebounce(search, 400);
//   // debouncedSearch only changes 400ms after the user stops typing.
//   // Use debouncedSearch in your API call, not `search`.
//
// ─────────────────────────────────────────────────────────────────────────────

export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    // Set a timer. When it fires, update the debounced value.
    const timer = setTimeout(() => setDebounced(value), delay);

    // If `value` changes before the timer fires, clear the old timer
    // and restart it. This is the debounce magic.
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
