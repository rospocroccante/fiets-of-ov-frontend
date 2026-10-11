import { forwardRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { DURATION, EASE } from "../lib/motion";

// A tab's whole screen, over both morph stages. It stays mounted while another tab is
// on screen (hidden, inert) so its scroll position survives a round trip; it fades in
// when it becomes the active tab. The bottom padding clears the tab bar.
export const TabScreen = forwardRef<HTMLDivElement, { name: "saved" | "profile"; active: boolean; children: ReactNode }>(
  function TabScreen({ name, active, children }, ref) {
    return (
      <motion.div
        ref={ref}
        data-fov={`${name}-screen`}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: active ? DURATION.base : 0, ease: EASE.enter }}
        style={{ visibility: active ? "visible" : "hidden" }}
        {...(active ? {} : { inert: "" as const, "aria-hidden": true as const })}
        className="fixed inset-0 z-[1400] overflow-y-auto overscroll-contain bg-white pb-[calc(3.5rem+env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] dark:bg-night-bg"
      >
        {children}
      </motion.div>
    );
  },
);
