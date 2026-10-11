// The results sheet's three resting heights and the rules for choosing between them.
// Pure, so the gesture code in ResultsSheet stays a thin shell over numbers that are
// tested here. Every height is the *visible* part of the sheet, in CSS pixels.

export type Detent = "peek" | "half" | "full";
export type DetentHeights = Record<Detent, number>;

const ORDER: readonly Detent[] = ["peek", "half", "full"];

// Handle plus the first line of the advice.
export const PEEK_PX = 132;
// A release faster than this moves one detent in the direction of travel.
export const FLICK_PX_PER_S = 500;
// Past the top or bottom detent the sheet follows the finger at a fifth of its speed.
export const RUBBER = 0.2;

export function detentHeights(container: number, viewport: number, safeBottom: number): DetentHeights {
  const full = Math.max(0, Math.round(container));
  const peek = Math.min(full, PEEK_PX + Math.round(safeBottom));
  const half = Math.min(full, Math.max(peek, Math.round(viewport * 0.5)));
  return { peek, half, full };
}

export function snapDetent(visible: number, growth: number, heights: DetentHeights): Detent {
  if (Math.abs(growth) > FLICK_PX_PER_S) {
    if (growth > 0) return ORDER.find((d) => heights[d] > visible + 1) ?? "full";
    return [...ORDER].reverse().find((d) => heights[d] < visible - 1) ?? "peek";
  }
  let best: Detent = "peek";
  let bestDist = Infinity;
  for (const d of ORDER) {
    const dist = Math.abs(heights[d] - visible);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

export function rubberBand(visible: number, min: number, max: number): number {
  if (visible > max) return max + (visible - max) * RUBBER;
  if (visible < min) return min - (min - visible) * RUBBER;
  return visible;
}

export function nextDetent(d: Detent, step: 1 | -1): Detent {
  const i = Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(d) + step));
  return ORDER[i];
}

export function cycleDetent(d: Detent): Detent {
  return d === "peek" ? "half" : d === "half" ? "full" : "peek";
}
