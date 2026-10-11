import { render, screen, fireEvent, within } from "@testing-library/react";
import { glassClasses } from "../test/glass";
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

test("the recents meta text carries the readable colour steps on both themes", () => {
  render(
    <HomeShortcuts
      saved={[]}
      recents={recents}
      onPickSaved={() => {}}
      onPickRecent={() => {}}
      onClearRecents={() => {}}
      now={10 * 60000}
    />,
  );
  // The header is a sentence-case title in the normal text colour now, with no
  // uppercase or tracking: it heads a section, like "Popular trips" above it.
  const header = screen.getByText("Recent");
  expect(header).toHaveClass("text-slate-900", "dark:text-night-text");
  expect(header).not.toHaveClass("uppercase");
  expect(header).not.toHaveClass("tracking-wide");
  // The recents sit straight on the aurora now, with no frosted panel under them, and
  // by day it darkens to luminance 0.40 under these rows: slate-500 measured 2.0:1
  // there and slate-700 4.4:1. These pins keep each line on the step that clears AA
  // against the darkest frame, so a copy-paste of the old greys fails here.
  const clear = screen.getByRole("button", { name: /clear/i });
  expect(clear).toHaveClass("text-slate-700", "hover:text-slate-900", "dark:text-night-subtle", "dark:hover:text-night-text");
  expect(screen.getByText("10m ago")).toHaveClass("text-slate-800", "dark:text-night-subtle");
});

// Each recent trip is a small grey metro line with its two ends named under it: from
// on the left, to on the right, the time-ago after the destination.
test("a recent trip is drawn as a line with its ends named either side", () => {
  render(
    <HomeShortcuts
      saved={[]}
      recents={recents}
      onPickSaved={() => {}}
      onPickRecent={() => {}}
      onClearRecents={() => {}}
      now={10 * 60000}
    />,
  );
  const row = screen.getByRole("button", { name: /zuid.*ndsm/i });
  const from = within(row).getByText("Zuid");
  const to = within(row).getByText("NDSM");
  const ago = within(row).getByText("10m ago");
  expect(from.compareDocumentPosition(to) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(to.compareDocumentPosition(ago) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // Each name truncates within its own half, in 13px medium muted text.
  const names = from.parentElement!;
  expect(names).toHaveClass("grid-cols-2", "text-[13px]", "font-medium", "text-slate-800", "dark:text-night-muted");
  expect(names).toContainElement(to);
  for (const name of [from, to]) expect(name).toHaveClass("truncate");
  // The line itself is decoration and carries no text.
  const line = row.querySelector('[aria-hidden="true"]');
  expect(line).not.toBeNull();
  expect(line!.textContent).toBe("");
});

test("no history renders as glass: chips are solid and recents sit on no panel", () => {
  const { container } = render(
    <HomeShortcuts
      saved={saved}
      recents={recents}
      onPickSaved={() => {}}
      onPickRecent={() => {}}
      onClearRecents={() => {}}
      now={10 * 60000}
    />,
  );
  expect(glassClasses(container)).toEqual([]);
  const chip = screen.getByRole("button", { name: /ndsm$/i });
  // Still a pill, because it is a control, but an opaque one.
  expect(chip).toHaveClass("rounded-full", "bg-white", "border-slate-200", "dark:bg-night-surface", "dark:border-night-rim/20");
  // Nothing between the section and the rows draws a surface.
  const row = screen.getByRole("button", { name: /zuid.*ndsm/i });
  for (let n = row.parentElement; n && n !== container; n = n.parentElement) {
    expect([...n.classList].filter((c) => /^(bg-|border|rounded-card|shadow)/.test(c)), n.tagName).toEqual([]);
  }
});
