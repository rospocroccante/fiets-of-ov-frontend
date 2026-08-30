import { useEffect, useRef } from "react";
import { useMotionValue, type MotionValue } from "framer-motion";

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
  const reduced =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const containerRef = useRef<HTMLDivElement>(null);

  // A plain motion value we drive ourselves from the window scroll position. This is
  // deterministic and monotonic — unlike framer's scrollYProgress, it does not drift when
  // the map stage mounts and changes document scrollHeight mid-morph. Safe in jsdom (the
  // effect is a no-op without a real window scroll).
  const progress = useMotionValue(0);

  useEffect(() => {
    if (reduced || typeof window === "undefined") return;
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
