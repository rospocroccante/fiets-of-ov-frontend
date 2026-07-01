import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom has no layout and does not implement scrollTo/matchMedia. The morph host
// and useMorphProgress call these; stub them so tests do not throw. The visual
// morph itself is verified at runtime (Playwright), not here.
if (typeof window !== "undefined") {
  // jsdom ships a scrollTo that throws "Not implemented"; overwrite it unconditionally.
  window.scrollTo = vi.fn();
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
}
