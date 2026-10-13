import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// The phone's Back button, made to mean something inside the app. Without this the app
// had no history of its own and Back left it from any screen.
//
// The app keeps its own state flags (searchOpen, placeInfo, the morph); this hook only
// mirrors which of them are open, as a stack of layers, into history entries. Opening a
// layer pushes an entry. A Back press is a popstate the hook did not cause, and it closes
// the layers the entry it lands on does not have, through onBack. An in-app close (an X,
// the back arrow) has already updated the UI, so it consumes its own entry with a back()
// whose popstate is ignored.
//
// Three things the browser does that the stack has to survive: entries from an earlier
// page load (the state survives a reload) are skipped; a forward step is undone, because
// a closed layer cannot be reopened from a history entry; and a push asked for while a
// back() is still travelling waits for it, or the traversal would land on the wrong
// entry.

export type Tab = "plan" | "saved" | "profile";
export type Layer = "map" | "sheet-full" | "search" | "place" | "privacy";

export type HistoryLike = Pick<History, "pushState" | "replaceState" | "back" | "state"> &
  Partial<Pick<History, "scrollRestoration">>;

export interface AppNav {
  tab: Tab;
  selectTab: (tab: Tab) => void;
  sync: (layer: Layer, open: boolean) => void;
}

interface NavEntry {
  session: string;
  idx: number;
  tab: Tab;
  layers: Layer[];
}

type Write = { mode: "push" | "replace"; entry: NavEntry };

const KEY = "fov";

function readEntry(state: unknown): NavEntry | null {
  if (!state || typeof state !== "object") return null;
  const e = (state as Record<string, unknown>)[KEY] as NavEntry | undefined;
  return e && typeof e.session === "string" && typeof e.idx === "number" && Array.isArray(e.layers) ? e : null;
}

const newSession = () => Math.random().toString(36).slice(2, 10);

export function useAppNav(onBack: (layer: Layer) => void, history: HistoryLike = window.history): AppNav {
  const [session] = useState(newSession);
  const [tab, setTab] = useState<Tab>("plan");
  const cur = useRef<NavEntry>({ session, idx: 0, tab: "plan", layers: [] });
  const ignore = useRef(0);
  const skippedStale = useRef(false);
  const queue = useRef<Write[]>([]);
  const h = useRef(history);
  h.current = history;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const apply = useCallback((w: Write) => {
    const state = { [KEY]: w.entry };
    if (w.mode === "push") h.current.pushState(state, "");
    else h.current.replaceState(state, "");
  }, []);

  const write = useCallback(
    (mode: Write["mode"], entry: NavEntry) => {
      cur.current = entry;
      if (ignore.current > 0) queue.current.push({ mode, entry });
      else apply({ mode, entry });
    },
    [apply],
  );

  // One step back on the app's own behalf. If the entry it would leave has not been
  // written yet (still queued), dropping it from the queue is the whole step.
  const stepBack = useCallback(() => {
    const q = queue.current;
    if (q.length > 0 && q[q.length - 1].mode === "push") {
      q.pop();
      return;
    }
    ignore.current += 1;
    h.current.back();
  }, []);

  // The document's scroll is the home/map morph, and the app moves it itself. With the
  // browser's restoration on, the history.back() that consumes a closed layer's entry
  // put back the scroll position saved in the entry it landed on: closing the phone
  // search screen to plan a trip restored scrollY 0 and cancelled the smooth scroll to
  // the map, leaving the app on the home.
  useEffect(() => {
    const hist = h.current;
    const before = hist.scrollRestoration;
    if (before === undefined) return;
    hist.scrollRestoration = "manual";
    return () => {
      hist.scrollRestoration = before;
    };
  }, []);

  useEffect(() => {
    cur.current = { session, idx: 0, tab: "plan", layers: [] };
    h.current.replaceState({ [KEY]: cur.current }, "");
    const onPop = (ev: PopStateEvent) => {
      if (ignore.current > 0) {
        ignore.current -= 1;
        if (ignore.current === 0) {
          const pending = queue.current;
          queue.current = [];
          pending.forEach(apply);
        }
        return;
      }
      // Whether this popstate answers a back() that skipped an earlier load's entry.
      const afterSkip = skippedStale.current;
      skippedStale.current = false;
      const e = readEntry(ev.state);
      if (!e) return;
      if (e.session !== session) {
        skippedStale.current = true;
        h.current.back();
        return;
      }
      const c = cur.current;
      if (e.idx > c.idx) {
        stepBack();
        return;
      }
      const closed = c.layers.filter((l) => !e.layers.includes(l)).reverse();
      cur.current = { ...e, layers: c.layers.filter((l) => e.layers.includes(l)) };
      if (closed.length === 0 && e.tab === c.tab) {
        // A dead entry (a layer closed under another left it) is skipped too, but not
        // the entry a stale skip lands on. This load's entries start at the one it
        // stamped on mount, so a skip that lands on one of them came from a forward step
        // onto an earlier load's entry, and landing here has already undone that step.
        // One more back() from here left the app.
        if (!afterSkip) h.current.back();
        return;
      }
      if (e.tab !== c.tab) setTab(e.tab);
      for (const l of closed) onBackRef.current(l);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [session, apply, stepBack]);

  const sync = useCallback(
    (layer: Layer, open: boolean) => {
      const c = cur.current;
      const at = c.layers.indexOf(layer);
      if (open && at === -1) {
        write("push", { ...c, idx: c.idx + 1, layers: [...c.layers, layer] });
      } else if (!open && at !== -1) {
        if (at === c.layers.length - 1 && c.idx > 0) {
          cur.current = { ...c, idx: c.idx - 1, layers: c.layers.slice(0, -1) };
          stepBack();
        } else {
          write("replace", { ...c, layers: c.layers.filter((l) => l !== layer) });
        }
      }
    },
    [write, stepBack],
  );

  const selectTab = useCallback(
    (next: Tab) => {
      const c = cur.current;
      if (next === c.tab) return;
      if (c.tab === "plan") write("push", { ...c, idx: c.idx + 1, tab: next });
      else if (next === "plan" && c.idx > 0) {
        cur.current = { ...c, idx: c.idx - 1, tab: "plan" };
        stepBack();
      } else write("replace", { ...c, tab: next });
      setTab(next);
    },
    [write, stepBack],
  );

  return useMemo(() => ({ tab, selectTab, sync }), [tab, selectTab, sync]);
}

// Keep one history entry per open layer: call with the flag that opens it.
export function useNavLayer(nav: AppNav, layer: Layer, open: boolean): void {
  const { sync } = nav;
  useEffect(() => {
    sync(layer, open);
  }, [sync, layer, open]);
}
