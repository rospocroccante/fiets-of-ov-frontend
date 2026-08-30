import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";
import { resetMapChunkState } from "../components/lazyMap";
import { __resetMapMock } from "../__mocks__/react-leaflet";

// Everything a test can leave behind for the next one, put back before each case.
//
// Vitest gives each *file* a fresh module registry, so this is not about files leaking
// into each other — it is about tests inside one file. Three things survived a test and
// silently decided whether the next one passed: lazyMap's "the chunk has been fetched"
// flag, the react-leaflet mock's event-handler tables, and localStorage. That is what
// made the suite order-dependent, and it is why `--sequence.shuffle` failed.
//
// Resetting here rather than in the tests is deliberate: a test that needs a cold start
// should not have to know that some *other* test warms the map, which is knowledge that
// goes stale the moment either test moves.
beforeEach(() => {
  resetMapChunkState();
  __resetMapMock();
  // Recents, saved places, language and theme all persist here. Tests that want a
  // stored value set it themselves, before render.
  window.localStorage.clear();
  // useTheme writes this class on the root element and jsdom keeps the same document
  // for the whole file, so a dark-mode test would otherwise darken its successors.
  document.documentElement.classList.remove("dark");
});

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
