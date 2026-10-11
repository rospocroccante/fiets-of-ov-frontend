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
