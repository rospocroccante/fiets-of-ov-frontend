import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { overlay, useLeaving, useMotionPreset } from "../lib/motion";

// A one-line notice with one action, above the tab bar. Used for "Removed X / Undo".
// role="status" makes it a polite live region. It leaves on its own after `ms`.
export function Snackbar({
  message,
  actionLabel,
  onAction,
  onDone,
  ms = 5000,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  onDone: () => void;
  ms?: number;
}) {
  const motionProps = useMotionPreset(overlay);
  const [leaving, leavingProps] = useLeaving();
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (leaving) return;
    const id = window.setTimeout(() => done.current(), ms);
    return () => window.clearTimeout(id);
  }, [leaving, ms]);
  return (
    <motion.div
      {...motionProps}
      {...leavingProps}
      role="status"
      data-fov="snackbar"
      className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] left-[calc(0.75rem+env(safe-area-inset-left))] right-[calc(0.75rem+env(safe-area-inset-right))] z-[1900] flex min-h-[48px] items-center justify-between gap-3 rounded-card bg-slate-900 pl-4 pr-2 text-sm text-white shadow-lg dark:bg-night-raised dark:text-night-text"
    >
      <span className="min-w-0 truncate">{message}</span>
      <button
        type="button"
        onClick={onAction}
        className="inline-flex min-h-[44px] shrink-0 items-center px-2 font-semibold text-amber-300 dark:text-night-accent"
      >
        {actionLabel}
      </button>
    </motion.div>
  );
}
