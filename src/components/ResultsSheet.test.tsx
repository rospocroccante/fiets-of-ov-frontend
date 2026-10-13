import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { animate, useReducedMotion } from "framer-motion";
import { vi } from "vitest";
import { ResultsSheet } from "./ResultsSheet";
import type { Detent } from "../lib/sheetDetents";
import { SPRING } from "../lib/motion";
import { stubHeights } from "../test/phone";

// framer reads the system setting once per process, so the hook is mocked; `animate` is
// the real one, watched, so a test can ask how a settle was started.
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return { ...actual, useReducedMotion: vi.fn(() => false), animate: vi.fn(actual.animate) };
});

let restore: (() => void) | null = null;
let nowSpy: { mockRestore: () => void } | null = null;
beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
  vi.mocked(animate).mockClear();
});
afterEach(() => {
  restore?.();
  restore = null;
  nowSpy?.mockRestore();
  nowSpy = null;
});

// The calls the sheet made to framer's animate, as (value, target, options).
function animateCalls() {
  return vi.mocked(animate).mock.calls as unknown as [unknown, number, Record<string, unknown>][];
}
function lastAnimate() {
  const calls = animateCalls();
  return calls[calls.length - 1];
}

// The sheet times a drag with performance.now(). jsdom dispatches a whole gesture in one
// task, so a test that cares whether a release is slow or a flick sets the clock: every
// reading is `stepMs` after the one before.
function clock(stepMs: number) {
  let t = 0;
  nowSpy = vi.spyOn(performance, "now").mockImplementation(() => (t += stepMs));
}

// jsdom has no layout. Give the frame, the header and the content the heights a 390x844
// phone measures: a 700px frame, a 160px handle and summary, and options far taller than
// the screen. jsdom's window is 768px tall, so the detents are peek 160, half 384, full 700.
function layout(sizes: { frame?: number; head?: number; body?: number } = {}) {
  restore = stubHeights({
    "sheet-frame": sizes.frame ?? 700,
    "sheet-head": sizes.head ?? 160,
    "sheet-body": sizes.body ?? 900,
  });
}

function sheet(detent: Detent, onDetent = vi.fn(), onSettle = vi.fn(), content: boolean = true) {
  return (
    <div data-fov="sheet-frame">
      <ResultsSheet
        detent={detent}
        onDetent={onDetent}
        onSettle={onSettle}
        header={
          <div>
            <p>24 min by bike</p>
            <button type="button" onClick={() => onDetent("header button")}>
              Start
            </button>
          </div>
        }
      >
        {content ? <p>advice</p> : null}
      </ResultsSheet>
    </div>
  );
}

function renderSheet(detent: Detent, onDetent = vi.fn(), onSettle = vi.fn(), content = true) {
  const view = render(sheet(detent, onDetent, onSettle, content));
  return { ...view, onDetent, onSettle };
}

const contentEl = () => document.querySelector('[data-fov="sheet-content"]') as HTMLElement;

test("a labelled region with its header, its content and a real handle button", () => {
  layout();
  renderSheet("half");
  expect(screen.getByRole("region", { name: "Trip results" })).toHaveAttribute("data-detent", "half");
  expect(screen.getByText("24 min by bike")).toBeInTheDocument();
  expect(screen.getByText("advice")).toBeInTheDocument();
  const handle = screen.getByRole("button", { name: "Expand results" });
  expect(handle).toHaveAttribute("aria-expanded", "false");
  expect(handle).toHaveClass("min-h-[44px]");
});

test("collapsed, the header is all that is live: the content is inert and hidden", async () => {
  layout();
  renderSheet("peek");
  const content = contentEl();
  expect(content).toHaveAttribute("inert", "");
  expect(content).toHaveAttribute("aria-hidden", "true");
  expect(screen.queryByText("advice")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
  await waitFor(() => expect(content.style.visibility).toBe("hidden"));
  expect(content.style.opacity).toBe("0");
});

test("at half the content is live and shown", async () => {
  layout();
  renderSheet("half");
  const content = contentEl();
  expect(content).not.toHaveAttribute("inert");
  expect(content).not.toHaveAttribute("aria-hidden");
  await waitFor(() => expect(content.style.visibility).toBe("visible"));
});

test("the collapsed height is the measured header, whatever it measures", async () => {
  layout({ head: 172 });
  const { onSettle } = renderSheet("peek");
  await waitFor(() => expect(onSettle).toHaveBeenLastCalledWith(172));
});

// Measured in Chrome at 320x568: the plan lands mid-morph, so the sheet's top is
// fractional, and the two edges the header is read from subtract to 165.00003 for a 1px
// border over a 164px header. Rounded up as it stood, that was a 166px peek, and a 1px
// strip of sheet under the header.
test("the collapsed height is the header to the pixel, whatever fraction its edges carry", async () => {
  layout({ head: 164 });
  const real = Element.prototype.getBoundingClientRect;
  const rects: Record<string, Partial<DOMRect>> = {
    "results-sheet": { top: 432.4906921386719 },
    // 164.00003: the head's own height carries the noise too.
    "sheet-head": { top: 433.4906921386719, bottom: 597.49072265625, height: 164 + 2 ** -15 },
  };
  const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const r = rects[this.getAttribute("data-fov") ?? ""];
    if (!r) return real.call(this);
    const base = { x: 0, y: 0, left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    return { ...base, ...r, toJSON: () => r } as DOMRect;
  });
  try {
    const { onSettle } = renderSheet("peek");
    await waitFor(() => expect(onSettle).toHaveBeenLastCalledWith(165));
  } finally {
    spy.mockRestore();
  }
});

test("reports the visible height once it settles", async () => {
  layout();
  const { onSettle } = renderSheet("half");
  await waitFor(() => expect(onSettle).toHaveBeenLastCalledWith(384));
});

test.each([
  ["peek", "half"],
  ["half", "full"],
  ["full", "peek"],
] as const)("a tap on the handle at %s asks for %s", (from, to) => {
  layout();
  const { onDetent } = renderSheet(from);
  fireEvent.click(screen.getByRole("button", { name: /results/i }));
  expect(onDetent).toHaveBeenCalledWith(to);
});

test("a tap on the header, away from its buttons, opens the collapsed sheet to half", () => {
  layout();
  const { onDetent } = renderSheet("peek");
  fireEvent.click(screen.getByText("24 min by bike"));
  expect(onDetent.mock.calls).toEqual([["half"]]);
});

test("a tap on a button in the header is that button's alone", () => {
  layout();
  const { onDetent } = renderSheet("peek");
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  expect(onDetent.mock.calls).toEqual([["header button"]]);
});

test("arrow keys step one detent and stop at the ends", () => {
  layout();
  const { onDetent } = renderSheet("peek");
  const handle = screen.getByRole("button", { name: /results/i });
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(onDetent.mock.calls).toEqual([["half"], ["peek"]]);
});

test("the content scrolls only at full height", () => {
  layout();
  const { rerender } = renderSheet("half");
  expect(contentEl().style.overflowY).toBe("hidden");
  rerender(sheet("full"));
  expect(contentEl().style.overflowY).toBe("auto");
  expect(screen.getByRole("button", { name: "Collapse results" })).toHaveAttribute("aria-expanded", "true");
});

// The sheet hugs: content that fits under half leaves one resting height, and nothing
// pretends there is more to open. The content here is a test's paragraph. In the app no
// real plan is that short (the one-option plan in browser-tests/specs/phone-nav.checks.mjs
// runs to 600px against a half of 422 at most), and only a sheet with no content hugs.
describe("a sheet whose content fits under half", () => {
  test("rests at the header and content's own height, with no handle to expand", async () => {
    layout({ body: 100 });
    const { onSettle } = renderSheet("peek");
    await waitFor(() => expect(onSettle).toHaveBeenLastCalledWith(260));
    expect(screen.queryByRole("button", { name: /results/i })).toBeNull();
    // At its only height everything in it is live, peek or not.
    expect(contentEl()).not.toHaveAttribute("inert");
    expect(screen.getByRole("region", { name: "Trip results" })).toHaveAttribute("data-hugs", "");
  });

  test("a tap on its header does nothing", () => {
    layout({ body: 100 });
    const { onDetent } = renderSheet("peek");
    fireEvent.click(screen.getByText("24 min by bike"));
    expect(onDetent).not.toHaveBeenCalled();
  });

  test("a drag only stretches it, and it comes back to its height", async () => {
    layout({ body: 100 });
    const { onDetent, onSettle } = renderSheet("peek");
    onSettle.mockClear();
    const header = screen.getByText("24 min by bike");
    touch(header, "touchstart", 600, false);
    for (const y of [580, 520, 420, 300]) touch(header, "touchmove", y, false);
    touch(header, "touchend", null, false);
    expect(onDetent).not.toHaveBeenCalled();
    await waitFor(() => expect(onSettle).toHaveBeenCalledWith(260));
  });

  test("with no content at all (loading, an error, every option filtered away) it is the header alone", async () => {
    layout({ body: 0 });
    const { onSettle } = renderSheet("peek", vi.fn(), vi.fn(), false);
    await waitFor(() => expect(onSettle).toHaveBeenLastCalledWith(160));
    expect(screen.queryByRole("button", { name: /results/i })).toBeNull();
  });
});

// A touch as the sheet's native listeners see it. jsdom has no TouchEvent; the sheet reads
// only `touches`, `cancelable` and the target, so a plain event carrying those is enough.
function touch(el: Element, type: "touchstart" | "touchmove" | "touchend", y: number | null, cancelable: boolean) {
  const e = new Event(type, { bubbles: true, cancelable });
  Object.defineProperty(e, "touches", { value: y == null ? [] : [{ clientY: y }] });
  el.dispatchEvent(e);
}

// Measured in Chrome with touch emulation: a drag that starts on the handle, which is
// `touch-action: none`, delivers every touchmove with cancelable false. Nothing can scroll
// under that finger, so there is nothing to prevent, and the sheet has to move anyway.
test("a drag on the handle moves the sheet even when its touchmoves cannot be cancelled", () => {
  layout();
  const { onDetent } = renderSheet("half");
  const handle = screen.getByRole("button", { name: "Expand results" });
  touch(handle, "touchstart", 500, false);
  for (const y of [480, 420, 340, 260, 200]) touch(handle, "touchmove", y, false);
  touch(handle, "touchend", null, false);
  expect(onDetent).toHaveBeenCalledWith("full");
});

test("a drag on the collapsed header moves the sheet too", () => {
  layout();
  const { onDetent } = renderSheet("peek");
  const header = screen.getByText("24 min by bike");
  touch(header, "touchstart", 700, false);
  for (const y of [690, 660, 600, 520, 480]) touch(header, "touchmove", y, false);
  touch(header, "touchend", null, false);
  expect(onDetent).toHaveBeenCalledWith("half");
});

// The release keeps the finger's speed: the settle that follows is the sheet's spring,
// started at the velocity the drag ended with, not a tween from rest.
test("the settle after a release is the sheet spring, at the release's velocity", () => {
  layout();
  clock(5);
  const onDetent = vi.fn();
  const { rerender } = renderSheet("peek", onDetent);
  const handle = screen.getByRole("button", { name: "Expand results" });
  touch(handle, "touchstart", 700, false);
  for (const y of [690, 670, 640, 600]) touch(handle, "touchmove", y, false);
  touch(handle, "touchend", null, false);
  expect(onDetent).toHaveBeenCalledWith("half");
  vi.mocked(animate).mockClear();
  rerender(sheet("half", onDetent));
  const call = lastAnimate();
  expect(call[1]).toBe(384);
  expect(call[2]).toMatchObject({ ...SPRING.sheet, velocity: expect.any(Number) });
  // Upward, so the sheet is growing when it lets go.
  expect(call[2].velocity as number).toBeGreaterThan(0);
});

test("a move the parent asks for, with no finger, is the spring from rest", () => {
  layout();
  const { rerender } = renderSheet("peek");
  vi.mocked(animate).mockClear();
  rerender(sheet("half"));
  const call = lastAnimate();
  expect(call[1]).toBe(384);
  expect(call[2]).toMatchObject({ type: "spring", velocity: 0 });
});

test("with reduced motion every settle is instant and still reported", async () => {
  vi.mocked(useReducedMotion).mockReturnValue(true);
  layout();
  clock(50);
  const onSettle = vi.fn();
  const { rerender } = renderSheet("peek", vi.fn(), onSettle);
  rerender(sheet("half", vi.fn(), onSettle));
  expect(onSettle).toHaveBeenLastCalledWith(384);
  for (const [, , options] of animateCalls()) {
    expect(options).not.toMatchObject({ type: "spring" });
  }
  // A drag released back where it started settles at once as well.
  onSettle.mockClear();
  const handle = screen.getByRole("button", { name: "Expand results" });
  touch(handle, "touchstart", 400, false);
  for (const y of [410, 420, 430]) touch(handle, "touchmove", y, false);
  touch(handle, "touchend", null, false);
  await waitFor(() => expect(onSettle).toHaveBeenCalledWith(384));
  expect(lastAnimate()[2]).toMatchObject({ duration: 0 });
});

// A drag that grabs the sheet mid-settle stops that animation before it reports, so the
// release has to report even when it snaps back to the detent it left. Without it the
// parent kept the previous detent's height and padded the map for a sheet no longer there.
test("a drag released back onto the detent it left still reports the settled height", async () => {
  layout();
  const { onSettle } = renderSheet("full");
  expect(onSettle).toHaveBeenLastCalledWith(700);
  onSettle.mockClear();
  const handle = screen.getByRole("button", { name: "Collapse results" });
  // Up past full: the sheet stretches, and on release falls back to full.
  touch(handle, "touchstart", 300, false);
  for (const y of [280, 240, 200]) touch(handle, "touchmove", y, false);
  touch(handle, "touchend", null, false);
  await waitFor(() => expect(onSettle).toHaveBeenCalledWith(700));
});

// Chrome sends no click after a touch that moved past its tap slop. A drag that left the
// sheet waiting for its click had the next real tap on the handle swallowed instead.
test("after a touch drag on the handle, the next tap on it still moves the sheet", () => {
  layout();
  const { onDetent } = renderSheet("full");
  const handle = screen.getByRole("button", { name: "Collapse results" });
  touch(handle, "touchstart", 100, false);
  for (const y of [140, 220, 300, 400]) touch(handle, "touchmove", y, false);
  touch(handle, "touchend", null, false);
  expect(onDetent.mock.calls).toEqual([["half"]]);
  // The tap: a touch that does not move, and the click Chrome makes of it.
  touch(handle, "touchstart", 100, false);
  touch(handle, "touchend", null, false);
  fireEvent.click(handle);
  expect(onDetent.mock.calls).toEqual([["half"], ["peek"]]);
});

test("a drag that ends on the header does not count as a tap on it", () => {
  layout();
  const { onDetent } = renderSheet("half");
  const header = screen.getByText("24 min by bike");
  touch(header, "touchstart", 420, false);
  for (const y of [430, 470, 520, 600]) touch(header, "touchmove", y, false);
  touch(header, "touchend", null, false);
  act(() => {
    fireEvent.click(header);
  });
  expect(onDetent.mock.calls).toEqual([["peek"]]);
});

// A mouse as the sheet's listeners see it. jsdom has no PointerEvent; the sheet reads only
// `pointerType`, `clientY` and the target.
function mouse(target: EventTarget, type: "pointerdown" | "pointermove" | "pointerup", y: number) {
  const e = new Event(type, { bubbles: true });
  Object.defineProperties(e, { pointerType: { value: "mouse" }, clientY: { value: y } });
  target.dispatchEvent(e);
}

function mouseDrag(handle: Element, from: number, to: number) {
  mouse(handle, "pointerdown", from);
  for (let k = 1; k <= 4; k++) mouse(window, "pointermove", from + ((to - from) * k) / 4);
  mouse(window, "pointerup", to);
}

// A mouse released on the handle after a drag makes a click there, which is the drag's
// own and must not cycle the sheet as well.
test("a mouse drag ignores the click its release makes on the handle", () => {
  layout();
  const { onDetent } = renderSheet("full");
  const handle = screen.getByRole("button", { name: "Collapse results" });
  mouseDrag(handle, 100, 400);
  fireEvent.click(handle);
  expect(onDetent.mock.calls).toEqual([["half"]]);
});

// Released anywhere else (past the end of its travel the sheet lags the pointer), the drag
// makes no click on the handle, and the next click there is a tap like any other.
test("after a mouse drag released off the handle, the next click on it still moves the sheet", () => {
  layout();
  const { onDetent } = renderSheet("full");
  const handle = screen.getByRole("button", { name: "Collapse results" });
  mouseDrag(handle, 100, 400);
  expect(onDetent.mock.calls).toEqual([["half"]]);
  mouse(handle, "pointerdown", 100);
  mouse(window, "pointerup", 100);
  fireEvent.click(handle);
  expect(onDetent.mock.calls).toEqual([["half"], ["peek"]]);
});

// Where the content scrolls by itself (full height, already scrolled), an uncancellable
// move means the browser is scrolling it, and the sheet keeps out of the way.
test("at full, an uncancellable drag in scrolled content is left to the content", () => {
  layout();
  const { onDetent } = renderSheet("full");
  const row = screen.getByText("advice");
  contentEl().scrollTop = 0;
  touch(row, "touchstart", 300, false);
  for (const y of [320, 380, 450]) touch(row, "touchmove", y, false);
  touch(row, "touchend", null, false);
  expect(onDetent).not.toHaveBeenCalled();
});
