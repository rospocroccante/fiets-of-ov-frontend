import { render, screen, fireEvent, within } from "@testing-library/react";
import { glassClasses } from "../test/glass";
import { HomeShortcuts, TripList } from "./HomeShortcuts";

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
  // The recents sit straight on the aurora, with no frosted panel under them, and by
  // day it darkens to luminance 0.38 under the rows' text: slate-600 measured 3.1:1
  // there and slate-700 4.3:1. These pins keep each line on the step that clears AA
  // against the darkest frame, so a copy-paste of the lighter greys fails here.
  const clear = screen.getByRole("button", { name: /clear/i });
  expect(clear).toHaveClass("text-slate-700", "hover:text-slate-900", "dark:text-night-subtle", "dark:hover:text-night-text");
  expect(screen.getByText("10m ago")).toHaveClass("text-slate-800", "dark:text-night-muted");
  expect(screen.getByText("from Zuid")).toHaveClass("text-slate-800", "dark:text-night-muted");
  // The chevron is no text, but it holds the 3:1 a visible mark needs: slate-400 fell
  // to 1.1:1 on the darkest frame.
  const chevron = document.querySelector('[data-fov="row-chevron"]');
  expect(chevron).toHaveClass("text-slate-600", "dark:text-night-faint");
});

// A recent trip is the popular trips' row with a clock in the circle: the destination
// over "from {origin}", the time-ago at the trailing end before the chevron.
test("a recent trip is a suggestion row: clock, destination over origin, time-ago before the chevron", () => {
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
  // Named like a popular trip, with the time-ago after it.
  const row = screen.getByRole("button", { name: "Zuid → NDSM, 10m ago" });
  const to = within(row).getByText("NDSM");
  const from = within(row).getByText("from Zuid");
  const ago = within(row).getByText("10m ago");
  const chevron = row.querySelector('[data-fov="row-chevron"]')!;
  expect(to.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(from.compareDocumentPosition(ago) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(ago.compareDocumentPosition(chevron) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(to).toHaveClass("truncate", "font-semibold", "text-slate-900", "dark:text-night-text");
  expect(ago).toHaveClass("shrink-0");
  // The same orb a popular trip leads with.
  const glyph = row.querySelector('[data-fov="row-glyph"]')!;
  expect(glyph).toHaveAttribute("aria-hidden", "true");
  expect(glyph).toHaveClass("trip-orb");
  expect(row).toHaveClass("min-h-16");
  // One column on a phone, two from `sm` up, as the popular trips are.
  expect(row.closest("ul")).toHaveClass("grid-cols-1", "sm:grid-cols-2");
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

// The file's own fixtures, one saved place and one recent trip, with no-op handlers
// unless a test passes its own.
function shortcutsElement(props: Partial<Parameters<typeof HomeShortcuts>[0]> = {}) {
  return (
    <HomeShortcuts
      saved={saved}
      recents={recents}
      onPickSaved={() => {}}
      onPickRecent={() => {}}
      onClearRecents={() => {}}
      now={10 * 60000}
      {...props}
    />
  );
}

const renderShortcuts = (props?: Partial<Parameters<typeof HomeShortcuts>[0]>) => render(shortcutsElement(props));

test("See all appears only when the host asks for it", () => {
  const onSeeAll = vi.fn();
  const { rerender } = renderShortcuts({ onSeeAll: undefined });
  expect(screen.queryByRole("button", { name: /see all/i })).toBeNull();
  rerender(shortcutsElement({ onSeeAll }));
  fireEvent.click(screen.getByRole("button", { name: /see all/i }));
  expect(onSeeAll).toHaveBeenCalledTimes(1);
});

// From `sm` the rows stand in two columns, filled row by row, so each column ends on one of
// the last two rows. Neither draws a hairline, for any number of rows. jsdom applies no
// CSS, so each item's own `last:` and `sm:[&...]` selectors are matched against it.
test.each([1, 2, 3, 4, 5, 6, 7, 8])("in two columns of %i rows, the last row of each column has no hairline", (n) => {
  render(<TripList columns>{Array.from({ length: n }, (_, i) => <span key={i} />)}</TripList>);
  const hides = (li: Element) =>
    li.className.split(" ").some((c) => {
      const m = /^(?:sm:\[&(.+)\]|(last)):after:hidden$/.exec(c);
      return m != null && li.matches(m[1] ?? ":last-child");
    });
  expect([...document.querySelectorAll("li")].map(hides)).toEqual(Array.from({ length: n }, (_, i) => i + 2 >= n));
});
