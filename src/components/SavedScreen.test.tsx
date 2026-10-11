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
