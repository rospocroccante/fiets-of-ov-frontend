import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useAppNav, type Layer } from "./useAppNav";

// A history with the browser's shape: one list of entries and a pointer, popstate
// delivered on a later task carrying the state of the entry it lands on.
function fakeHistory(initial: unknown[] = [null]) {
  const entries = [...initial];
  let i = entries.length - 1;
  const fire = () => {
    const state = entries[i];
    setTimeout(() => window.dispatchEvent(new PopStateEvent("popstate", { state })), 0);
  };
  return {
    entries,
    get index() {
      return i;
    },
    get state() {
      return entries[i];
    },
    pushState(s: unknown) {
      entries.splice(i + 1);
      entries.push(s);
      i = entries.length - 1;
    },
    replaceState(s: unknown) {
      entries[i] = s;
    },
    back() {
      if (i > 0) {
        i -= 1;
        fire();
      }
    },
    forward() {
      if (i < entries.length - 1) {
        i += 1;
        fire();
      }
    },
  };
}

type Fake = ReturnType<typeof fakeHistory>;
const entry = (h: Fake, at = h.index) => (h.entries[at] as { fov: { tab: string; layers: Layer[]; idx: number } }).fov;

// Several macrotasks: a skipped entry answers with another back(), which needs its own.
const flush = () =>
  act(async () => {
    for (let k = 0; k < 6; k++) await new Promise((r) => setTimeout(r, 0));
  });

function setup(h: Fake = fakeHistory()) {
  const onBack = vi.fn();
  const view = renderHook(() => useAppNav(onBack, h as unknown as History));
  return { h, onBack, nav: () => view.result.current };
}

test("starts on the plan tab and stamps the current entry", () => {
  const { h, nav } = setup();
  expect(nav().tab).toBe("plan");
  expect(entry(h)).toMatchObject({ idx: 0, tab: "plan", layers: [] });
});

test("opening a layer pushes one entry, and Back closes it through onBack", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().sync("search", true));
  expect(h.index).toBe(1);
  act(() => h.back());
  await flush();
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledWith("search");
  // The app reacts by closing the sheet, which must not move history again.
  act(() => nav().sync("search", false));
  await flush();
  expect(h.index).toBe(0);
});

test("an in-app close consumes its entry without calling onBack", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().sync("privacy", true));
  act(() => nav().sync("privacy", false));
  await flush();
  expect(h.index).toBe(0);
  expect(onBack).not.toHaveBeenCalled();
});

test("Back closes the top layer only", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().sync("map", true));
  act(() => nav().sync("sheet-full", true));
  act(() => h.back());
  await flush();
  expect(onBack.mock.calls).toEqual([["sheet-full"]]);
  act(() => h.back());
  await flush();
  expect(onBack.mock.calls).toEqual([["sheet-full"], ["map"]]);
});

test("two quick Back presses close two layers, top first", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().sync("map", true));
  act(() => nav().sync("place", true));
  act(() => {
    h.back();
    h.back();
  });
  await flush();
  expect(onBack.mock.calls).toEqual([["place"], ["map"]]);
});

test("a layer closed under another leaves an entry that Back skips", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().sync("map", true));
  act(() => nav().sync("place", true));
  act(() => nav().sync("map", false)); // the morph went home by hand, card still up
  expect(entry(h).layers).toEqual(["place"]);
  act(() => h.back());
  await flush();
  expect(onBack.mock.calls).toEqual([["place"]]);
  act(() => h.back());
  await flush();
  expect(onBack.mock.calls).toEqual([["place"]]);
  expect(h.index).toBe(0);
});

test("Plan to Saved pushes, Saved to Profile replaces, Back returns to Plan", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().selectTab("saved"));
  expect(nav().tab).toBe("saved");
  expect(h.index).toBe(1);
  act(() => nav().selectTab("profile"));
  expect(h.index).toBe(1);
  expect(entry(h).tab).toBe("profile");
  act(() => h.back());
  await flush();
  expect(nav().tab).toBe("plan");
  expect(onBack).not.toHaveBeenCalled();
});

test("tapping Plan from another tab steps back on the app's behalf", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().selectTab("saved"));
  act(() => nav().selectTab("plan"));
  expect(nav().tab).toBe("plan");
  await flush();
  expect(h.index).toBe(0);
  expect(nav().tab).toBe("plan");
  expect(onBack).not.toHaveBeenCalled();
});

test("a forward step is undone", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().sync("search", true));
  act(() => h.back());
  await flush();
  act(() => h.forward());
  await flush();
  expect(h.index).toBe(0);
  expect(onBack).toHaveBeenCalledTimes(1);
});

test("entries left by an earlier page load are skipped", async () => {
  const old = (idx: number, layers: Layer[]) => ({ fov: { session: "old", idx, tab: "plan", layers } });
  const h = fakeHistory([null, old(1, ["map"]), old(2, ["map", "search"])]);
  const { onBack } = setup(h);
  expect(h.index).toBe(2);
  act(() => h.back());
  await flush();
  expect(onBack).not.toHaveBeenCalled();
  expect(h.index).toBe(0);
});

test("a push asked for while a step back is in flight lands after it", async () => {
  const { h, nav } = setup();
  act(() => nav().selectTab("saved"));
  await flush();
  act(() => {
    nav().selectTab("plan");
    nav().sync("search", true);
  });
  await flush();
  expect(h.index).toBe(1);
  expect(entry(h)).toMatchObject({ tab: "plan", layers: ["search"] });
  expect(h.entries.length).toBe(2);
});

test("closing a layer whose push is still queued cancels the push", async () => {
  const { h, onBack, nav } = setup();
  act(() => nav().selectTab("saved"));
  await flush();
  act(() => {
    nav().selectTab("plan");
    nav().sync("search", true);
    nav().sync("search", false);
  });
  await flush();
  expect(h.index).toBe(0);
  expect(entry(h).layers).toEqual([]);
  expect(onBack).not.toHaveBeenCalled();
});
