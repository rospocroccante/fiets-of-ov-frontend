import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { waitForExit } from "../test/exit";
import { SavedScreen, type SavedScreenProps } from "./SavedScreen";

const artis = { id: "52.3660,4.9166", name: "Artis", label: "Plantage Kerklaan", lat: 52.366, lon: 4.9166, savedAt: 2 };
const zuid = { id: "52.3389,4.8730", name: "Zuid", label: "Amsterdam Zuid", lat: 52.3389, lon: 4.873, savedAt: 1 };
const trip = { fromLabel: "De Pijp", fromQuery: "De Pijp", toLabel: "NDSM", toQuery: "NDSM", at: 0 };

function renderSaved(over: Partial<SavedScreenProps> = {}) {
  const props: SavedScreenProps = {
    places: [artis, zuid],
    recents: [trip],
    onPickPlace: vi.fn(),
    onPickRecent: vi.fn(),
    onDeletePlace: vi.fn(),
    onRestorePlace: vi.fn(),
    onClearRecents: vi.fn(),
    onSearch: vi.fn(),
    now: 60_000,
    ...over,
  };
  render(<SavedScreen {...props} />);
  return props;
}

test("lists places and recent trips under their headings", () => {
  renderSaved();
  expect(screen.getByRole("heading", { level: 1, name: "Saved" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Places" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Recent" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Artis/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /NDSM/ })).toBeInTheDocument();
});

// A recent trip looks the same here as on the home: the same row, one column, each on
// a hairline of its own.
test("a recent trip is the home's suggestion row", () => {
  renderSaved();
  const row = screen.getByRole("button", { name: "De Pijp → NDSM, 1m ago" });
  expect(within(row).getByText("from De Pijp")).toBeInTheDocument();
  expect(row.querySelector('[data-fov="row-glyph"] svg')).toHaveAttribute("data-glyph", "clock");
  expect(row.querySelector('[data-fov="row-chevron"]')).not.toBeNull();
  const list = row.closest("ul")!;
  expect(list).toHaveClass("grid-cols-1");
  expect(list).not.toHaveClass("sm:grid-cols-2");
  expect(row.closest("li")).toHaveClass("after:h-px", "after:bg-slate-200", "dark:after:bg-night-border");
});

// The places above use the same geometry, so the two sections' text starts on one line:
// the star sits in the recent rows' 40px circle, with the same gap, height, secondary
// colour and inset hairline.
test("a saved place lines up with the recent rows under it", () => {
  renderSaved();
  const place = screen.getByRole("button", { name: /Artis/ });
  const glyph = place.querySelector('[data-fov="row-glyph"]');
  expect(glyph).toHaveAttribute("aria-hidden", "true");
  expect(glyph).toHaveClass("h-10", "w-10", "rounded-full", "bg-slate-100", "dark:bg-night-raised");
  expect(glyph).toHaveTextContent("star");
  expect(place).toHaveClass("min-h-16", "gap-4");
  expect(within(place).getByText("Plantage Kerklaan")).toHaveClass("text-[13px]", "text-slate-800", "dark:text-night-muted");
  const item = place.closest("li")!;
  expect(item).toHaveClass("after:h-px", "after:left-14", "after:bg-slate-200", "dark:after:bg-night-border");
  expect(item.parentElement!.className).not.toMatch(/divide-/);
});

test("tapping a place or a trip hands it to the host", () => {
  const p = renderSaved();
  fireEvent.click(screen.getByRole("button", { name: /Artis/ }));
  fireEvent.click(screen.getByRole("button", { name: /NDSM/ }));
  expect(p.onPickPlace).toHaveBeenCalledWith(artis);
  expect(p.onPickRecent).toHaveBeenCalledWith(trip);
});

test("Edit shows a delete button per place; deleting offers Undo", async () => {
  const p = renderSaved();
  expect(screen.queryByRole("button", { name: "Delete Artis" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit" }));
  const del = screen.getByRole("button", { name: "Delete Artis" });
  expect(del).toHaveClass("min-h-[44px]", "min-w-[44px]");
  fireEvent.click(del);
  expect(p.onDeletePlace).toHaveBeenCalledWith(artis);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("Removed Artis");
  fireEvent.click(within(status).getByRole("button", { name: "Undo" }));
  expect(p.onRestorePlace).toHaveBeenCalledWith(artis);
  // Undo also puts the snackbar away; the test ends once its exit has finished.
  await waitForExit(status);
});

test("Clear all asks twice", () => {
  const p = renderSaved();
  fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
  expect(p.onClearRecents).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tap again to clear" }));
  expect(p.onClearRecents).toHaveBeenCalledTimes(1);
});

test("an empty Saved tab says so and offers a search", () => {
  const p = renderSaved({ places: [], recents: [] });
  expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Search for a place" }));
  expect(p.onSearch).toHaveBeenCalledTimes(1);
});
