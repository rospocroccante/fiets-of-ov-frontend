import { waitFor } from "@testing-library/react";

// An overlay that closes through AnimatePresence stays in the document for its exit,
// inert and hidden (useLeaving in lib/motion), and framer removes it on its next
// animation frame. setup.ts makes the exit instant, but not synchronous: the removal is
// still a React update that lands a frame after the interaction that closed the overlay.
// A test that stops before then lets that update land outside act(), and React prints a
// warning for it.
//
// Await this after the interaction, with the element captured while it was open. The
// test then ends on the screen the user is left with, and it doubles as an assertion:
// an element that never leaves fails here.
export function waitForExit(element: Element): Promise<void> {
  return waitFor(() => {
    if (element.isConnected) throw new Error("the element is still in the document, playing its exit");
  });
}
