import { act } from "@testing-library/react";
import { vi } from "vitest";

// jsdom answers `false` to every media query, which is what keeps the whole existing
// suite (and the desktop layout it describes) on the unchanged path. A phone is the
// one query answering true; restore the real matchMedia afterwards or the next test in
// the file inherits a phone.
//
// `landscape` is the same phone on its side: 844 wide and 390 tall, so the width
// breakpoint stays false and the short-screen queries answer true instead.
export function phoneViewport({ landscape = false }: { landscape?: boolean } = {}): () => void {
  const real = window.matchMedia;
  const phone = landscape ? /max-height:\s*500px/ : /max-width:\s*639\.98px/;
  window.matchMedia = ((query: string) => ({
    matches: phone.test(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = real;
  };
}

// jsdom has no layout, so every offsetHeight is 0 and the phone geometry falls back to
// its desktop constants. These are the two boxes that geometry is solved from; give
// them the heights a real 390x844 phone measures and the arithmetic becomes testable.
export function stubHeights(byName: Record<string, number>): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const name = this.getAttribute("data-fov");
      return name != null && name in byName ? byName[name] : 0;
    },
  });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  };
}

// Park the morph at a given progress. useMorphProgress divides window.scrollY by
// window.innerHeight, so this is the whole story.
export async function morphTo(progress: number) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: Math.round(window.innerHeight * progress),
  });
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    // framer paints motion values on its own frame loop, so the opacity this test
    // reads only lands after one has run.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
