// The results sheet's resting heights and the rules for choosing between them. Pure, so
// the gesture code in ResultsSheet stays a thin shell over numbers that are tested here.
// Every height is the *visible* part of the sheet, in CSS pixels.

export type Detent = "peek" | "half" | "full";
export type DetentHeights = Record<Detent, number>;

const ORDER: readonly Detent[] = ["peek", "half", "full"];

// A release faster than this moves one detent in the direction of travel.
export const FLICK_PX_PER_S = 500;
// Past the top or bottom detent the sheet follows the finger at a fifth of its speed.
export const RUBBER = 0.2;

// What the heights are solved from, all measured by the sheet as laid out.
export interface SheetSizes {
  // The sheet's frame: the most of it that can ever show.
  container: number;
  // The window's height; half is half of it.
  viewport: number;
  // env(safe-area-inset-bottom), which the collapsed header has to clear.
  safeBottom: number;
  // The handle and the summary header, which is everything the collapsed sheet shows.
  header: number;
  // The content under the header at its natural height, its own padding included.
  // 0 when the sheet has none (a plan loading, a plan that failed).
  content: number;
}

// Peek is the header, measured, above the bottom inset: the collapsed sheet shows the
// header whole and never a slice of what is under it.
//
// The sheet hugs its content. When the header and the content fit under half, the sheet
// is exactly that tall and that is its only resting height: there are no detents to
// fake. Half and full exist only when there is more to show, and full stops where the
// content ends if that comes before the frame does.
export function detentHeights({ container, viewport, safeBottom, header, content }: SheetSizes): DetentHeights {
  const frame = Math.max(0, Math.round(container));
  const peek = Math.min(frame, Math.round(header) + Math.round(safeBottom));
  const natural = content > 0 ? Math.max(peek, Math.round(header) + Math.round(content)) : peek;
  const half = Math.round(viewport * 0.5);
  if (natural <= half) {
    const only = Math.min(frame, natural);
    return { peek: only, half: only, full: only };
  }
  const full = Math.min(frame, natural);
  return { peek, half: Math.min(full, Math.max(peek, half)), full };
}

// Whether the sheet has a single resting height: nothing to expand, nothing to collapse.
export function hugs(heights: DetentHeights): boolean {
  return heights.peek === heights.full;
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
