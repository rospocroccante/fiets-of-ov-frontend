import { useRef } from "react";
import {
  useScroll,
  useMotionValue,
  type MotionValue,
} from "framer-motion";

export interface MorphControls {
  progress: MotionValue<number>;
  containerRef: React.RefObject<HTMLDivElement>;
  toMap: () => void;
  toHome: () => void;
  reduced: boolean;
}

export function useMorphProgress(): MorphControls {
  const reduced =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const containerRef = useRef<HTMLDivElement>(null);

  // Under reduced motion we skip scroll scrubbing and use a plain motion value.
  // We must call hooks unconditionally, so we call both and choose below.
  //
  // NOTE: we do NOT pass containerRef as the `container` option to useScroll.
  // framer-motion defers scroll tracking to a microtask and throws an invariant
  // if the ref is defined but its `.current` is null (unattached) at that point —
  // which is always the case in jsdom tests. Instead we track window scroll
  // (no container option), which works in both jsdom and a real browser, and
  // still produces a 0..1 scrollYProgress over the full document height.
  // The containerRef is still attached to the scroll container div by the host so
  // toMap() can read offsetHeight for the scroll target.
  const reducedProgress = useMotionValue(0);
  const { scrollYProgress } = useScroll({
    offset: ["start start", "end start"],
  });

  const progress = reduced ? reducedProgress : scrollYProgress;

  const toMap = () => {
    if (reduced) {
      reducedProgress.set(1);
      return;
    }
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({
        top: containerRef.current?.offsetHeight ?? 0,
        behavior: "smooth",
      });
    }
  };

  const toHome = () => {
    if (reduced) {
      reducedProgress.set(0);
      return;
    }
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return { progress, containerRef, toMap, toHome, reduced };
}
