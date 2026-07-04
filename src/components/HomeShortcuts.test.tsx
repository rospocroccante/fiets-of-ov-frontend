import { render, screen, fireEvent } from "@testing-library/react";
import { HomeShortcuts } from "./HomeShortcuts";

const saved = [
  { id: "52.4010,4.8935", name: "NDSM", label: "NDSM Werf", lat: 52.401, lon: 4.8935, savedAt: 1 },
];
const recents = [
  { fromLabel: "Zuid", fromQuery: "52.34,4.87", toLabel: "NDSM", toQuery: "52.40,4.89", at: 0 },
];

test("renders nothing without history", () => {
  const { container } = render(
    <HomeShortcuts saved={[]} recents={[]} onPickSaved={() => {}} onPickRecent={() => {}} onClearRecents={() => {}} />,
  );
  expect(container.firstChild).toBeNull();
});

test("saved chip and recent row fire their callbacks; clear clears", () => {
  const picked: string[] = [];
  const cleared = vi.fn();
  render(
    <HomeShortcuts
      saved={saved}
      recents={recents}
      onPickSaved={(p) => picked.push(`saved:${p.name}`)}
      onPickRecent={(t) => picked.push(`recent:${t.toLabel}`)}
      onClearRecents={cleared}
      now={10 * 60000}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /ndsm$/i }));
  fireEvent.click(screen.getByText(/zuid/i));
  fireEvent.click(screen.getByRole("button", { name: /clear/i }));
  expect(picked).toEqual(["saved:NDSM", "recent:NDSM"]);
  expect(cleared).toHaveBeenCalledTimes(1);
  expect(screen.getByText("10m ago")).toBeInTheDocument();
});
