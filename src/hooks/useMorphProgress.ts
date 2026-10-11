import { useEffect, useRef } from "react";
import { useMotionValue, type MotionValue } from "framer-motion";
import { useMediaQuery } from "./useMediaQuery";

export interface MorphControls {
  progress: MotionValue<number>;
  containerRef: React.RefObject<HTMLDivElement>;
  toMap: () => void;
  toHome: () => void;
  reduced: boolean;
}

// The host renders an h-[200vh] scroll container, so exactly one viewport of scroll
// distance drives the morph. Progress = clamp(scrollY / oneViewport, 0, 1).
export function useMorphProgress(): MorphControls {
  // Read live: a rider can switch reduced motion on or off in the system settings
  // with the app open, and the morph follows without a reload. False where matchMedia
  // does not exist (jsdom), as before.
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const wasReduced = useRef(reduced);

  const containerRef = useRef<HTMLDivElement>(null);

  // A plain motion value we drive ourselves from the window scroll position. This is
  // deterministic and monotonic — unlike framer's scrollYProgress, it does not drift when
  // the map stage mounts and changes document scrollHeight mid-morph. Safe in jsdom (the
  // effect is a no-op without a real window scroll).
  const progress = useMotionValue(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only a switch made while the app is open lands here with `switched` set; at mount
    // both branches below behave exactly as they always have.
    const switched = wasReduced.current !== reduced;
    wasReduced.current = reduced;
    if (reduced) {
      // Reduced motion has no scroll to finish a morph with, so a switch caught
      // half-way would leave a half-faded, half-live screen. Settle on the closer stage.
      if (switched) progress.set(Math.round(progress.get()));
      return;
    }
    if (switched) {
      // Back on the scroll-driven morph, the container has just grown to two viewports
      // with the page at its top. Put the scroll where the stage is first, or the read
      // below would send a rider who is on the map back to the home.
      window.scrollTo({ top: progress.get() * (window.innerHeight || 1), behavior: "instant" });
    }
    const update = () => {
      const dist = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, window.scrollY / dist));
      progress.set(p);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [reduced, progress]);

  const toMap = () => {
    if (reduced) {
      progress.set(1);
      return;
    }
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: window.innerHeight, behavior: "smooth" });
    }
  };

  const toHome = () => {
    if (reduced) {
      progress.set(0);
      return;
    }
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return { progress, containerRef, toMap, toHome, reduced };
}
