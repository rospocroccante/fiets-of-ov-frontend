import { useCallback, useEffect, useState } from "react";

// A destructive button that asks twice: the first tap arms it (its label says "Tap again
// to clear"), a second tap inside the window runs the action, and doing nothing disarms
// it. Lighter than a dialog for a one-line action, and it cannot be dismissed by accident
// into doing the thing.
export function useConfirmTap(action: () => void, ms = 4000): { armed: boolean; tap: () => void } {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), ms);
    return () => window.clearTimeout(id);
  }, [armed, ms]);
  const tap = useCallback(() => {
    if (armed) {
      setArmed(false);
      action();
    } else setArmed(true);
  }, [armed, action]);
  return { armed, tap };
}
