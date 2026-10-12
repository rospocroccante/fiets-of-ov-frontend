import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ResultsSheet } from "./ResultsSheet";
import type { Detent } from "../lib/sheetDetents";

// jsdom has no layout: give the host the height a 390x844 phone's map stage has.
function stubHostHeight(px: number) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === "host" ? px : 0;
    },
  });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, "clientHeight", original);
  };
}

function renderSheet(detent: Detent, onDetent = vi.fn(), onSettle = vi.fn()) {
  const view = render(
    <div data-testid="host">
      <ResultsSheet detent={detent} onDetent={onDetent} onSettle={onSettle}>
        <p>advice</p>
      </ResultsSheet>
    </div>,
  );
  return { ...view, onDetent, onSettle };
}

test("a labelled region with its content and a real handle button", () => {
  renderSheet("half");
  expect(screen.getByRole("region", { name: "Trip results" })).toHaveAttribute("data-detent", "half");
  expect(screen.getByText("advice")).toBeInTheDocument();
  const handle = screen.getByRole("button", { name: "Expand results" });
  expect(handle).toHaveAttribute("aria-expanded", "false");
  expect(handle).toHaveClass("min-h-[44px]");
});

test.each([
  ["peek", "half"],
  ["half", "full"],
  ["full", "peek"],
] as const)("a tap on the handle at %s asks for %s", (from, to) => {
  const { onDetent } = renderSheet(from);
  fireEvent.click(screen.getByRole("button", { name: /results/i }));
  expect(onDetent).toHaveBeenCalledWith(to);
});

test("arrow keys step one detent and stop at the ends", () => {
  const { onDetent } = renderSheet("peek");
  const handle = screen.getByRole("button", { name: /results/i });
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  fireEvent.keyDown(handle, { key: "ArrowDown" });
  expect(onDetent.mock.calls).toEqual([["half"], ["peek"]]);
});

test("the content scrolls only at full height", () => {
  const { rerender } = renderSheet("half");
  const content = document.querySelector('[data-fov="sheet-content"]') as HTMLElement;
  expect(content.style.overflowY).toBe("hidden");
  rerender(
    <div data-testid="host">
      <ResultsSheet detent="full" onDetent={() => {}}>
        <p>advice</p>
      </ResultsSheet>
    </div>,
  );
  expect(content.style.overflowY).toBe("auto");
  expect(screen.getByRole("button", { name: "Collapse results" })).toHaveAttribute("aria-expanded", "true");
});

test("reports the visible height once it settles", async () => {
  const restore = stubHostHeight(700);
  const { onSettle } = renderSheet("half");
  // jsdom innerHeight is 768: half = 384, full = 700.
  await waitFor(() => expect(onSettle).toHaveBeenLastCalledWith(384));
  restore();
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
  const restore = stubHostHeight(700);
  const { onDetent } = renderSheet("half");
  const handle = screen.getByRole("button", { name: "Expand results" });
  touch(handle, "touchstart", 500, false);
  for (const y of [480, 420, 340, 260, 200]) touch(handle, "touchmove", y, false);
  touch(handle, "touchend", null, false);
  expect(onDetent).toHaveBeenCalledWith("full");
  restore();
});

// A drag that grabs the sheet mid-settle stops that animation before it reports, so the
// release has to report even when it snaps back to the detent it left. Without it the
// parent kept the previous detent's height and padded the map for a sheet no longer there.
test("a drag released back onto the detent it left still reports the settled height", async () => {
  const restore = stubHostHeight(700);
  const { onSettle } = renderSheet("full");
  expect(onSettle).toHaveBeenLastCalledWith(700);
  onSettle.mockClear();
  const handle = screen.getByRole("button", { name: "Collapse results" });
  // Up past full: the sheet stretches, and on release falls back to full.
  touch(handle, "touchstart", 300, false);
  for (const y of [280, 240, 200]) touch(handle, "touchmove", y, false);
  touch(handle, "touchend", null, false);
  await waitFor(() => expect(onSettle).toHaveBeenCalledWith(700));
  restore();
});

// Chrome sends no click after a touch that moved past its tap slop. A drag that left the
// sheet waiting for its click had the next real tap on the handle swallowed instead.
test("after a touch drag on the handle, the next tap on it still moves the sheet", () => {
  const restore = stubHostHeight(700);
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
  restore();
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
  const restore = stubHostHeight(700);
  const { onDetent } = renderSheet("full");
  const handle = screen.getByRole("button", { name: "Collapse results" });
  mouseDrag(handle, 100, 400);
  fireEvent.click(handle);
  expect(onDetent.mock.calls).toEqual([["half"]]);
  restore();
});

// Released anywhere else (past the end of its travel the sheet lags the pointer), the drag
// makes no click on the handle, and the next click there is a tap like any other.
test("after a mouse drag released off the handle, the next click on it still moves the sheet", () => {
  const restore = stubHostHeight(700);
  const { onDetent } = renderSheet("full");
  const handle = screen.getByRole("button", { name: "Collapse results" });
  mouseDrag(handle, 100, 400);
  expect(onDetent.mock.calls).toEqual([["half"]]);
  mouse(handle, "pointerdown", 100);
  mouse(window, "pointerup", 100);
  fireEvent.click(handle);
  expect(onDetent.mock.calls).toEqual([["half"], ["peek"]]);
  restore();
});

// Where the content scrolls by itself (full height, already scrolled), an uncancellable
// move means the browser is scrolling it, and the sheet keeps out of the way.
test("at full, an uncancellable drag in scrolled content is left to the content", () => {
  const restore = stubHostHeight(700);
  const { onDetent } = renderSheet("full");
  const content = document.querySelector('[data-fov="sheet-content"]') as HTMLElement;
  const row = screen.getByText("advice");
  content.scrollTop = 0;
  touch(row, "touchstart", 300, false);
  for (const y of [320, 380, 450]) touch(row, "touchmove", y, false);
  touch(row, "touchend", null, false);
  expect(onDetent).not.toHaveBeenCalled();
  restore();
});
