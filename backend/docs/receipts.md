# Message Receipt States

## SENT
- What it means: The server has saved the message to the database.
- How we know: The sender received the `message:new` acknowledgement back from
  the server (Step 6 in message:send handler).
- Visual: One grey tick (like WhatsApp).

## DELIVERED
- What it means: The message has reached at least one open device of each recipient.
- How we know: When a recipient's client receives `message:new`, it immediately
  sends a confirmation back to the server (`message:delivered` event).
  The server updates the message status and tells the sender.
- Visual: Two grey ticks.

## READ
- What it means: The recipient actually SAW the message on screen —
  the tab was focused AND the message was in the visible area.
- How we know: The client sends `message:read` when the user scrolls to
  (or already sees) the message AND the browser tab is focused.
- Visual: Two blue ticks.

## Group read rule (for version 1)
- Show "READ" only when EVERY recipient has read it.
- Until then, show the count of who has read it.
- This is decided and implemented in the receipts handler.
