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
  const chosen = content().querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;
  expect(within(chosen).getByText("By bike")).toBeInTheDocument();
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

// The desktop results column and a phone on its side list the same rows beside the map.
test.each([
  ["on desktop", false],
  ["on a phone on its side", true],
] as const)("%s, while a ride is on, the results column's option rows choose nothing", async (_where, landscape) => {
  for (const r of restore.reverse()) r();
  restore = landscape ? [phoneViewport({ landscape: true })] : [];
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await morphTo(1);
  const column = await waitFor(() => {
    const c = document.querySelector('[data-fov="results-column"]') as HTMLElement | null;
    if (!c || !within(c).queryByRole("button", { name: "Start navigation" })) throw new Error("no results yet");
    return c;
  });
  fireEvent.click(within(column).getByRole("button", { name: "Start navigation" }));
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();

  const rows = [...column.querySelectorAll('[data-fov="option-button"]')];
  expect(rows).toHaveLength(2);
  for (const row of rows) fireEvent.click(row);
  const chosen = column.querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;
  expect(within(chosen).getByText("By bike")).toBeInTheDocument();
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  expect(screen.queryByText(/~29 min/)).toBeNull();
});

test("the other option's minutes choose it, as a tap on its row would", async () => {
  renderApp();
  await planVondelpark();
  fireEvent.click(within(summary()).getByRole("button", { name: "Public transport, 29 min" }));
  expect(within(summary()).getByText("Public transport")).toHaveAttribute("data-fov", "summary-title");
  const chosen = content().querySelector('[data-fov="option"][data-selected="true"]') as HTMLElement;
  expect(within(chosen).getByText("Public transport")).toBeInTheDocument();
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

test("the mock badge sits on the map just above the settled sheet, clear of its Start", async () => {
  phoneLayout();
  renderApp();
  const badge = document.querySelector('[data-fov="mock-badge"]') as HTMLElement;
  // On the home, with the tab bar up, it sits over the bar's top edge as before.
  expect(badge).toHaveClass("bottom-[calc(4.25rem+env(safe-area-inset-bottom))]", "z-[1850]");
  expect(badge.style.bottom).toBe("");

  await planVondelpark();
  // The collapsed sheet is its 160px header (jsdom has no safe area), and the badge sits
  // 8px above it, on the left: in the corner it used to cover the summary's Start.
  await waitFor(() => expect(badge.style.bottom).toBe("168px"));
  expect(badge).toHaveClass("left-[calc(0.75rem+env(safe-area-inset-left))]", "z-[1850]");
  expect(badge.className).not.toMatch(/(^|\s)bottom-\[/);

  // It follows the sheet when the sheet settles somewhere else: half is half the window.
  fireEvent.click(within(summary()).getByText("By bike"));
  const half = Math.round(window.innerHeight / 2);
  await waitFor(() => expect(badge.style.bottom).toBe(`${half + 8}px`));

  // Back on the home the tab bar returns, and so does the badge's place over it.
  await morphTo(0);
  expect(badge.style.bottom).toBe("");
  expect(badge).toHaveClass("bottom-[calc(4.25rem+env(safe-area-inset-bottom))]");
});

test("on desktop the mock badge keeps its corner", async () => {
  for (const r of restore.reverse()) r();
  restore = [];
  renderApp();
  await morphTo(1);
  const badge = document.querySelector('[data-fov="mock-badge"]') as HTMLElement;
  expect(badge).toHaveClass("bottom-[calc(0.75rem+env(safe-area-inset-bottom))]");
  expect(badge.style.bottom).toBe("");
});
