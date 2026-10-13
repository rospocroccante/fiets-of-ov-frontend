import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { TabBar } from "./TabBar";

test("three tabs, the active one marked as the current page, each 44px", () => {
  render(<TabBar tab="saved" onSelect={() => {}} hidden={false} compact={false} />);
  const nav = screen.getByRole("navigation", { name: "Sections" });
  const buttons = within(nav).getAllByRole("button");
  expect(buttons.map((b) => b.textContent)).toEqual(["Plan", "Saved", "Profile"]);
  expect(within(nav).getByRole("button", { name: "Saved" })).toHaveAttribute("aria-current", "page");
  expect(within(nav).getByRole("button", { name: "Plan" })).not.toHaveAttribute("aria-current");
  for (const b of buttons) expect(b).toHaveClass("min-h-[44px]");
});

test("a tap reports the tab, including the active one", () => {
  const onSelect = vi.fn();
  render(<TabBar tab="plan" onSelect={onSelect} hidden={false} compact={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  fireEvent.click(screen.getByRole("button", { name: "Plan" }));
  expect(onSelect.mock.calls).toEqual([["profile"], ["plan"]]);
});

test("compact keeps an accessible name without a visible label", () => {
  render(<TabBar tab="plan" onSelect={() => {}} hidden={false} compact />);
  const saved = screen.getByRole("button", { name: "Saved" });
  expect(saved.textContent).toBe("");
});

test("a hidden bar is out of reach", () => {
  const { container } = render(<TabBar tab="plan" onSelect={() => {}} hidden compact={false} />);
  const nav = container.querySelector('[data-fov="tab-bar"]')!;
  expect(nav).toHaveAttribute("inert");
  expect(nav).toHaveAttribute("aria-hidden", "true");
});

// The bar is its row (56px, or 44 on its side) plus the bottom inset, which is the number
// App ends the home's scroller on. A border on the bar added a pixel to that: measured in
// Chrome at 57 and 45, with the home's scroller running 1px under the bar. The top rule is
// drawn inside the bar instead, where it takes no height.
test.each([
  [false, "h-14"],
  [true, "h-11"],
] as const)("compact %s: the bar is its %s row, the top rule takes no height", (compact, row) => {
  render(<TabBar tab="plan" onSelect={() => {}} hidden={false} compact={compact} />);
  const nav = screen.getByRole("navigation", { name: "Sections" });
  expect(nav.className).not.toMatch(/(^|\s)border(-t)?(\s|$)/);
  expect(nav.querySelector("ul")).toHaveClass(row);
  const rule = nav.querySelector('[data-fov="tab-bar-rule"]');
  expect(rule).toHaveClass("absolute", "h-px");
});
