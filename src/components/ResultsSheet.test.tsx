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
