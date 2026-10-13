import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { getPlan } from "./api/client";
import { morphTo, phoneViewport, stubHeights } from "./test/phone";

// The portrait phone's results sheet as the app drives it: what a plan lands as, what the
// summary header does, and what a failed or pending plan leaves on the screen.

// The planner is the real mock-mode one, wrapped in a spy, so a test can make one call
// fail or hang and count the calls a retry makes.
vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return { ...actual, getPlan: vi.fn(actual.getPlan) };
});
const realClient = await vi.importActual<typeof import("./api/client")>("./api/client");

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

let restore: Array<() => void> = [];
beforeEach(() => {
  vi.mocked(getPlan).mockReset();
  vi.mocked(getPlan).mockImplementation(realClient.getPlan);
  restore = [phoneViewport()];
});
afterEach(() => {
  for (const r of restore.reverse()) r();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

// jsdom has no layout, and a sheet whose boxes all measure 0 hugs (one resting height).
// These are the heights a 390x844 phone measures: a 160px header over options that run
// past the screen, so the sheet has a peek, a half and a full.
function phoneLayout() {
  restore.push(stubHeights({ "sheet-frame": 700, "sheet-head": 160, "sheet-body": 900 }));
}

const sheet = () => screen.queryByRole("region", { name: "Trip results" });
const summary = () => document.querySelector('[data-fov="sheet-summary"]') as HTMLElement;
const content = () => document.querySelector('[data-fov="sheet-content"]') as HTMLElement;

async function planVondelpark() {
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await morphTo(1);
  await waitFor(() => expect(within(summary()).getByText("By bike")).toBeInTheDocument());
}

test("with no trip there is no sheet at all", async () => {
  renderApp();
  await morphTo(1);
  expect(sheet()).toBeNull();
  // The frame stays: the place card lives in it on this layout.
  expect(document.querySelector('[data-fov="sheet-frame"]')).not.toBeNull();
});

test("a plan lands with the sheet collapsed on its summary, the content out of reach", async () => {
  phoneLayout();
  renderApp();
  await planVondelpark();
  expect(sheet()).toHaveAttribute("data-detent", "peek");
  const s = summary();
  expect(within(s).getByText("24 min")).toBeInTheDocument();
  expect(within(s).getByText("Best")).toBeInTheDocument();
  expect(within(s).getByText("Dry")).toBeInTheDocument();
  expect(content()).toHaveAttribute("inert", "");
  expect(content()).toHaveAttribute("aria-hidden", "true");
  expect(document.querySelector('[data-fov="results-column"]')).toBeNull();
});

test("a tap on the summary opens the sheet to half, with the options live", async () => {
  phoneLayout();
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "half");
  expect(content()).not.toHaveAttribute("inert");
  // Shown as the sheet rises, which framer paints on its next frame.
  await waitFor(() => expect(within(content()).getByRole("list", { name: "Travel options" })).toBeInTheDocument());
});

test("a new search brings an open sheet back to its summary", async () => {
  phoneLayout();
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "half");
  fireEvent.click(within(summary()).getByRole("button", { name: "Public transport, 29 min" }));
  expect(sheet()).toHaveAttribute("data-detent", "half");
  await morphTo(0);
  fireEvent.click(screen.getByRole("button", { name: "De Pijp → Rijksmuseum" }));
  await morphTo(1);
  await waitFor(() => expect(sheet()).toHaveAttribute("data-detent", "peek"));
});

test("Start in the summary starts navigation", async () => {
  renderApp();
  await planVondelpark();
  // It is the one Start on the layout: the folded steps in the content do not repeat it.
  const starts = screen.getAllByRole("button", { name: "Start navigation" });
  expect(starts).toHaveLength(1);
  expect(summary()).toContainElement(starts[0]);
  fireEvent.click(starts[0]);
  expect(screen.getByRole("button", { name: /exit navigation/i })).toBeInTheDocument();
  // While the ride is on, the banner's Exit is the control and the summary has no Start.
  expect(within(summary()).queryByRole("button", { name: "Start navigation" })).toBeNull();
  expect(sheet()).toHaveAttribute("data-detent", "peek");
});

// The route a ride navigates is the chosen option's. A tap that chose another one mid-ride
// would swap the route under the rider, rebuilt from the itinerary's origin rather than
// from where they are.
test("while a ride is on, nothing in the summary can change the trip it navigates", async () => {
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByRole("button", { name: "Start navigation" }));
  expect(screen.getByRole("button", { name: /exit navigation/i })).toBeInTheDocument();
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();

  // The other option's minutes, which choose it at any other time, leave with the Start:
  // the banner's Exit is the one control while riding.
  expect(within(summary()).queryByRole("button", { name: "Public transport, 29 min" })).toBeNull();
  expect(within(summary()).queryAllByRole("button")).toHaveLength(0);
  // Every part of the summary, pressed: the option and the route being ridden stay.
  for (const el of summary().querySelectorAll("*")) fireEvent.click(el);
  expect(within(summary()).getByText("By bike")).toHaveAttribute("data-fov", "summary-title");
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  expect(screen.queryByText(/~29 min/)).toBeNull();
});

// The same for the sheet opened over a ride: its option rows would choose another option
// and swap the route being ridden. They show the options and choose none; the chosen
// option's steps stay there to read.
test("while a ride is on, the option rows in the opened sheet choose nothing, and the steps stay", async () => {
  phoneLayout();
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByRole("button", { name: "Start navigation" }));
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "half");
  expect(content()).not.toHaveAttribute("inert");

  const rows = [...content().querySelectorAll('[data-fov="option-button"]')];
  expect(rows).toHaveLength(2);
  for (const row of rows) fireEvent.click(row);
  // The chosen row carries no title on this layout: the header names it, and the row
  // that is not chosen is still the other option.
  const chosen = content().querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;
  const other = content().querySelector('[data-fov="option"][data-selected="false"]') as HTMLElement;
  expect(within(other).getByText("Public transport")).toHaveAttribute("data-fov", "option-title");
  expect(within(summary()).getByText("By bike")).toHaveAttribute("data-fov", "summary-title");
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  expect(screen.queryByText(/~29 min/)).toBeNull();
  // The ride's steps: the disclosure is there and opens.
  const steps = chosen.querySelector('[data-fov="option-steps"]') as HTMLDetailsElement;
  expect(steps).not.toBeNull();
  fireEvent.click(chosen.querySelector('[data-fov="steps-toggle"]') as HTMLElement);
  expect(steps.open).toBe(true);
  // Shown as the sheet rises, which framer paints on its next frame.
  await waitFor(() => expect(within(steps).getAllByRole("listitem").length).toBeGreaterThan(0));
});

// The summary header names the chosen option, with its Best tag and minutes, at every
// height of the sheet. At half and full the chosen option in the content shows only what
// the header does not: its leg bar, its four figures, the departure line and the steps.
test("at half the chosen option's title is in the header alone, and the content holds its figures and steps", async () => {
  phoneLayout();
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "half");
  await waitFor(() => expect(within(content()).getByRole("list", { name: "Travel options" })).toBeInTheDocument());

  const titles = within(sheet()!).getAllByText("By bike");
  expect(titles).toHaveLength(1);
  expect(titles[0]).toHaveAttribute("data-fov", "summary-title");
  expect(within(sheet()!).getAllByText("Best")).toHaveLength(1);
  expect(within(sheet()!).getAllByText("24 min")).toHaveLength(1);

  const chosen = content().querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;
  expect(chosen.querySelector('[data-fov="option-title"]')).toBeNull();
  expect(chosen.querySelector('[data-fov="leg-bar"]')).not.toBeNull();
  expect(chosen.querySelectorAll('[data-fov="option-metrics"] li')).toHaveLength(4);
  expect(chosen.querySelector('[data-fov="departure"]')).not.toBeNull();
  const steps = chosen.querySelector('[data-fov="option-steps"]') as HTMLDetailsElement;
  fireEvent.click(chosen.querySelector('[data-fov="steps-toggle"]') as HTMLElement);
  expect(steps.open).toBe(true);
  expect(within(steps).getAllByRole("listitem").length).toBeGreaterThan(0);

  // The other option is a whole row, title, minutes and all.
  const other = content().querySelector('[data-fov="option"][data-selected="false"]') as HTMLElement;
  expect(within(other).getByText("Public transport")).toHaveAttribute("data-fov", "option-title");
  expect(within(other).getByText("29 min")).toBeInTheDocument();
});

test("a row chosen in the opened sheet loses its title row to the header, and the one it replaced gets its own back", async () => {
  phoneLayout();
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByText("By bike"));
  await waitFor(() => expect(within(content()).getByRole("list", { name: "Travel options" })).toBeInTheDocument());

  const transit = content().querySelector('[data-fov="option"][data-selected="false"] [data-fov="option-button"]') as HTMLElement;
  fireEvent.click(transit);
  expect(within(summary()).getByText("Public transport")).toHaveAttribute("data-fov", "summary-title");
  const titles = within(sheet()!).getAllByText("Public transport");
  expect(titles).toHaveLength(1);
  expect(titles[0]).toHaveAttribute("data-fov", "summary-title");
  const chosen = content().querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;
  expect(chosen.querySelector('[data-fov="option-title"]')).toBeNull();
  expect(chosen.querySelector('[data-fov="option-steps"]')).not.toBeNull();

  const bike = content().querySelector('[data-fov="option"][data-selected="false"]') as HTMLElement;
  expect(within(bike).getByText("By bike")).toHaveAttribute("data-fov", "option-title");
  expect(within(bike).getByText("Best")).toBeInTheDocument();
  expect(within(bike).getByText("24 min")).toBeInTheDocument();
});

// A desktop, or a phone on its side: the Vondelpark trip planned into the results column
// beside the map.
async function planIntoColumn(landscape: boolean) {
  for (const r of restore.reverse()) r();
  restore = landscape ? [phoneViewport({ landscape: true })] : [];
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await morphTo(1);
  return waitFor(() => {
    const c = document.querySelector('[data-fov="results-column"]') as HTMLElement | null;
    if (!c || !within(c).queryByRole("button", { name: "Start navigation" })) throw new Error("no results yet");
    return c;
  });
}

// The column has no summary header above it, so its chosen option keeps the whole row.
test.each([
  ["on desktop", false],
  ["on a phone on its side", true],
] as const)("%s the chosen option in the results column keeps its title, Best tag and minutes", async (_where, landscape) => {
  const column = await planIntoColumn(landscape);
  expect(sheet()).toBeNull();
  const chosen = column.querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;
  expect(within(chosen).getByText("By bike")).toHaveAttribute("data-fov", "option-title");
  expect(within(chosen).getByText("Best")).toBeInTheDocument();
  expect(within(chosen).getByText("24 min")).toBeInTheDocument();
  expect(chosen.querySelector('[data-fov="leg-bar"]')).not.toBeNull();
  expect(chosen.querySelector('[data-fov="departure"]')).not.toBeNull();
});

// A desktop, or a phone on its side: a ride started from the results column's Start.
async function rideFromColumn(landscape: boolean) {
  const column = await planIntoColumn(landscape);
  fireEvent.click(within(column).getByRole("button", { name: "Start navigation" }));
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  return column;
}

const chosenIn = (column: HTMLElement) =>
  column.querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;

// The desktop results column and a phone on its side list the same rows beside the map.
test.each([
  ["on desktop", false],
  ["on a phone on its side", true],
] as const)("%s, while a ride is on, the results column's option rows choose nothing", async (_where, landscape) => {
  const column = await rideFromColumn(landscape);
  const rows = [...column.querySelectorAll('[data-fov="option-button"]')];
  expect(rows).toHaveLength(2);
  for (const row of rows) fireEvent.click(row);
  expect(within(chosenIn(column)).getByText("By bike")).toBeInTheDocument();
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  expect(screen.queryByText(/~29 min/)).toBeNull();
});

// The mode chips beside the map filter the options, and the ride follows the chosen one:
// turning off the ridden mode's chip used to fall back to the next option and swap the
// ride for its route. The portrait phone hides the chips during a ride.
test.each([
  ["on desktop", false],
  ["on a phone on its side", true],
] as const)("%s, while a ride is on, the mode chips leave it alone, and after Exit they filter again", async (_where, landscape) => {
  const column = await rideFromColumn(landscape);
  const bar = document.querySelector('[data-fov="filter-bar"]') as HTMLElement;
  const bike = within(bar).getByRole("button", { name: "Bike" });
  fireEvent.click(bike);
  expect(bike).toHaveAttribute("aria-pressed", "true");
  expect(within(chosenIn(column)).getByText("By bike")).toBeInTheDocument();
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  expect(screen.queryByText(/~29 min/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /exit navigation/i }));
  expect(screen.queryByRole("button", { name: /exit navigation/i })).toBeNull();
  fireEvent.click(bike);
  expect(bike).toHaveAttribute("aria-pressed", "false");
  await waitFor(() => expect(within(chosenIn(column)).getByText("Public transport")).toBeInTheDocument());
});

test("the other option's minutes choose it, as a tap on its row would", async () => {
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByRole("button", { name: "Public transport, 29 min" }));
  expect(within(summary()).getByText("Public transport")).toHaveAttribute("data-fov", "summary-title");
  const other = content().querySelector('[data-fov="option"][data-selected="false"]') as HTMLElement;
  expect(within(other).getByText("By bike")).toHaveAttribute("data-fov", "option-title");
});

test("the forecast strip and the credits are in the content, under the options", async () => {
  renderApp();
  await planVondelpark();
  const list = within(content()).getByRole("list", { name: "Travel options" });
  const credits = content().querySelector('[data-fov="attribution"]') as HTMLElement;
  expect(credits).not.toBeNull();
  expect(list.compareDocumentPosition(credits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  const strip = await waitFor(() => {
    const el = content().querySelector('[data-fov="weather-strip"]');
    if (!el) throw new Error("no strip yet");
    return el;
  });
  expect(list.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("while a plan is on its way the sheet is the summary alone, with no forecast or credits", async () => {
  vi.mocked(getPlan).mockImplementation(() => new Promise(() => {}));
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await morphTo(1);
  expect(within(summary()).getByText("Planning your trip…")).toBeInTheDocument();
  expect(content().querySelector('[data-fov="sheet-body"]')).toBeEmptyDOMElement();
  expect(document.querySelector('[data-fov="weather-strip"]')).toBeNull();
  expect(document.querySelector('[data-fov="attribution"]')).toBeNull();
});

test("a failed plan reads as a sentence, and Try again runs the same search", async () => {
  vi.mocked(getPlan).mockRejectedValueOnce(new Error("routing upstream unavailable"));
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await morphTo(1);
  const s = await waitFor(() => within(summary()).getByText("Routes are unavailable right now. Try again in a moment."));
  expect(s).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/upstream/);
  expect(content().querySelector('[data-fov="sheet-body"]')).toBeEmptyDOMElement();
  expect(document.querySelector('[data-fov="weather-strip"]')).toBeNull();

  const first = vi.mocked(getPlan).mock.calls[0];
  await act(async () => {
    fireEvent.click(within(summary()).getByRole("button", { name: "Try again" }));
  });
  await waitFor(() => expect(within(summary()).getByText("By bike")).toBeInTheDocument());
  expect(vi.mocked(getPlan)).toHaveBeenCalledTimes(2);
  expect(vi.mocked(getPlan).mock.calls[1].slice(0, 2)).toEqual(first.slice(0, 2));
});

test("on desktop the results column is unchanged: no sheet, no summary, the Start in the panel", async () => {
  for (const r of restore.reverse()) r();
  restore = [];
  renderApp();
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
  await screen.findByRole("button", { name: "Start navigation" });
  expect(sheet()).toBeNull();
  expect(summary()).toBeNull();
  const column = document.querySelector('[data-fov="results-column"]') as HTMLElement;
  expect(within(column).getByRole("button", { name: "Start navigation" })).toBeInTheDocument();
});

// The mock badge sits where nothing is under it, in every phone layout. On the home it
// is at the top centre, in the hero's headroom, which does not scroll. On a portrait
// phone's map stage it is a map overlay in the top-left corner, under the floating
// chrome: one spot at every height of the sheet, under the sheet's layer, in one column
// with a pick's hint so the two never meet. Placed from the sheet's settled top instead,
// it sat on the sheet's Start while a finger held the sheet between two detents. A full
// sheet hides the map and the badge goes with it, as the radar button does.
test("the mock badge sits where nothing is under it: the home's top, the map's corner, away at full", async () => {
  phoneLayout();
  renderApp();
  const badge = () => document.querySelector('[data-fov="mock-badge"]') as HTMLElement;
  expect(document.querySelectorAll('[data-fov="mock-badge"]')).toHaveLength(1);
  // On the home it used to sit over the tab bar's top edge, over the scroller's rows.
  expect(badge()).toHaveClass("fixed", "top-[calc(0.75rem+env(safe-area-inset-top))]", "left-1/2", "-translate-x-1/2", "z-[1850]");
  expect(badge().className).not.toMatch(/(^|\s)bottom-/);

  await planVondelpark();
  // On the map, under the chips: 12px under topInset, which jsdom measures as 0.
  const pane = document.querySelector("#fov-map-main > section") as HTMLElement;
  await waitFor(() => expect(pane).toContainElement(badge()));
  expect(document.querySelectorAll('[data-fov="mock-badge"]')).toHaveLength(1);
  const column = badge().parentElement as HTMLElement;
  expect(column).toHaveClass("absolute", "left-3", "z-[1000]", "pointer-events-none");
  expect(column.style.top).toBe("12px");
  expect(badge().className).not.toMatch(/(^|\s)(fixed|top-|bottom-|z-)/);
  expect(badge().style.cssText).toBe("");
  expect(badge()).not.toHaveClass("invisible");

  // A pick armed from the map tools puts its hint on the same line, and the badge goes
  // under it in the column.
  fireEvent.click(screen.getByRole("button", { name: "Map options" }));
  fireEvent.click(within(document.querySelector('[data-fov="filter-panel"]') as HTMLElement).getByRole("button", { name: "Start" }));
  const hint = screen.getByText("Click the map to set the start");
  expect(hint.parentElement).toBe(column);
  expect([...column.children]).toEqual([hint, badge()]);

  // The sheet moving does not move it.
  fireEvent.click(within(summary()).getByText("By bike"));
  await waitFor(() => expect(sheet()).toHaveAttribute("data-detent", "half"));
  expect(badge().parentElement).toBe(column);
  expect(column.style.top).toBe("12px");
  expect(badge()).not.toHaveClass("invisible");

  // At full it goes, and it is back when the sheet comes down.
  fireEvent.click(screen.getByRole("button", { name: "Expand results" }));
  await waitFor(() => expect(sheet()).toHaveAttribute("data-detent", "full"));
  expect(badge()).toHaveClass("invisible");
  fireEvent.click(screen.getByRole("button", { name: "Collapse results" }));
  await waitFor(() => expect(sheet()).toHaveAttribute("data-detent", "peek"));
  expect(badge()).not.toHaveClass("invisible");

  // Back on the home, the top centre again, and the only badge.
  await morphTo(0);
  expect(document.querySelectorAll('[data-fov="mock-badge"]')).toHaveLength(1);
  expect(badge()).toHaveClass("fixed", "top-[calc(0.75rem+env(safe-area-inset-top))]", "left-1/2");
});

// The Saved and Profile screens scroll under anything fixed, and their titles leave no
// room that holds in every language ("Bewaard" at 320px reaches the screen's middle).
// They show only what is on the device, nothing the mock planner or geocoder answered,
// so the badge has nothing to say there and steps away until the tab bar's Plan.
test("on a tab screen the mock badge steps away", () => {
  renderApp();
  const badge = () => document.querySelector('[data-fov="mock-badge"]') as HTMLElement;
  const bar = () => within(document.querySelector('[data-fov="tab-bar"]') as HTMLElement);
  for (const tab of ["Saved", "Profile"]) {
    fireEvent.click(bar().getByRole("button", { name: tab }));
    expect(document.querySelectorAll('[data-fov="mock-badge"]')).toHaveLength(1);
    expect(badge()).toHaveClass("invisible");
  }
  fireEvent.click(bar().getByRole("button", { name: "Plan" }));
  expect(badge()).not.toHaveClass("invisible");
  expect(badge()).toHaveClass("top-[calc(0.75rem+env(safe-area-inset-top))]", "left-1/2");
});

// On a phone on its side the badge sat in the bottom-left corner, over the results
// column's option rows. The header's right end is empty on a phone (the menu is the
// Profile tab there), so the badge sits in it, centred on the 56px bar.
test("on a phone on its side the mock badge sits in the header's empty right end", async () => {
  restore.push(phoneViewport({ landscape: true }));
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await morphTo(1);
  await waitFor(() => expect(document.querySelectorAll('[data-fov="option"]').length).toBeGreaterThan(0));
  expect(sheet()).toBeNull();
  const badge = document.querySelector('[data-fov="mock-badge"]') as HTMLElement;
  expect(badge).toHaveClass("fixed", "top-[calc(1rem+env(safe-area-inset-top))]", "right-[calc(1rem+env(safe-area-inset-right))]", "z-[1850]");
  expect(badge.className).not.toMatch(/(^|\s)(bottom|left)-/);
});

test("on desktop the mock badge keeps its corner", async () => {
  for (const r of restore.reverse()) r();
  restore = [];
  renderApp();
  await morphTo(1);
  const badge = document.querySelector('[data-fov="mock-badge"]') as HTMLElement;
  expect(badge).toHaveClass("bottom-[calc(0.75rem+env(safe-area-inset-bottom))]");
});
