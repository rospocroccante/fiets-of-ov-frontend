import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { whenMapMounted } from "./test/mapReady";
import { morphTo, phoneViewport, stubHeights } from "./test/phone";

// The rain radar as the app drives it: a round button on a phone's map, and the inline
// segment on a desktop's filter bar.

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
afterEach(() => {
  for (const r of restore.reverse()) r();
  restore = [];
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

function phone(opts?: { landscape?: boolean }) {
  restore.push(phoneViewport(opts));
}

const floating = () => document.querySelector('[data-fov="radar-button"]') as HTMLElement | null;
// The map's own wrapper: the readout (with its Rain and Wind toggles) lives in it.
const mapWrap = () => document.querySelector(".leaflet-container")!.parentElement as HTMLElement;
const readoutShown = () => within(mapWrap()).queryByRole("button", { name: "Rain" }) !== null;
const summary = () => document.querySelector('[data-fov="sheet-summary"]') as HTMLElement;
const sheet = () => document.querySelector('[data-fov="results-sheet"]') as HTMLElement;

async function planDry() {
  fireEvent.click(screen.getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }));
  await waitFor(() => expect(screen.getAllByText("Dry").length).toBeGreaterThan(0));
}

test("on a portrait phone the radar is a round button on the map, and it turns the map's radar on and off", async () => {
  phone();
  renderApp();
  await whenMapMounted();
  await morphTo(1);

  const b = floating();
  expect(b).not.toBeNull();
  // The one Radar control on the layout: the chip row's Map menu no longer has one.
  expect(screen.getByRole("button", { name: "Radar" })).toBe(b);
  expect(b).toHaveAttribute("aria-pressed", "false");
  // A round 48px button with the reset's white surface and shadow, its icon an inline
  // SVG rather than a glyph from the frozen icon font.
  expect(b).toHaveClass("h-12", "w-12", "rounded-full", "shadow-md", "bg-white", "dark:bg-night-raised");
  expect(b!.className).not.toMatch(/dark:(bg|border)-white/);
  expect(b!.querySelector("svg")).not.toBeNull();
  expect(b!.querySelector(".material-symbols-rounded")).toBeNull();
  // On the map stage, outside the chip row, in the right-hand corner and 12px under the
  // floating chrome (whose inset is 0 in jsdom, which has no layout).
  expect(b!.closest('[data-fov="map-stage"]')).not.toBeNull();
  expect(b!.closest('[data-fov="map-chrome"]')).toBeNull();
  expect(b).toHaveClass("absolute", "right-3");
  expect(b!.style.top).toBe("12px");
  expect(readoutShown()).toBe(false);

  fireEvent.click(b!);
  expect(b).toHaveAttribute("aria-pressed", "true");
  // On, it is filled: brand by day, the night accent at night.
  const fill = b!.querySelector('[data-fov="radar-fill"]');
  expect(fill).toHaveClass("bg-brand", "dark:bg-night-accent");
  await waitFor(() => expect(readoutShown()).toBe(true));

  fireEvent.click(b!);
  expect(b).toHaveAttribute("aria-pressed", "false");
  expect(b!.querySelector('[data-fov="radar-fill"]')).toBeNull();
  await waitFor(() => expect(readoutShown()).toBe(false));
});

test("a phone on its side gets the same button, in the top-right corner of the map pane", async () => {
  phone({ landscape: true });
  renderApp();
  await whenMapMounted();
  await morphTo(1);

  const b = floating();
  expect(b).not.toBeNull();
  expect(screen.getByRole("button", { name: "Radar" })).toBe(b);
  expect(b).toHaveClass("absolute", "right-3", "h-12", "w-12");
  expect(b!.style.top).toBe("12px");
  // In the map's pane, beside the results column rather than in it.
  expect(b!.closest('[data-fov="results-column"]')).toBeNull();
  expect(b!.parentElement).toContainElement(mapWrap());

  fireEvent.click(b!);
  await waitFor(() => expect(readoutShown()).toBe(true));
  fireEvent.click(b!);
  await waitFor(() => expect(readoutShown()).toBe(false));
});

test("the phone's Map menu keeps its tools and has no radar in it", async () => {
  phone();
  renderApp();
  await morphTo(1);
  fireEvent.click(screen.getByRole("button", { name: /map options/i }));
  const panel = document.querySelector('[data-fov="filter-panel"]') as HTMLElement;
  for (const name of [/^start$/i, /^end$/i, /hide map/i]) {
    expect(within(panel).getByRole("button", { name })).toBeInTheDocument();
  }
  expect(within(panel).queryByRole("button", { name: "Radar" })).toBeNull();
});

test("on desktop the radar stays an inline segment of the filter bar, and nothing floats on the map", async () => {
  renderApp();
  await whenMapMounted();
  await morphTo(1);
  expect(floating()).toBeNull();
  const bar = document.querySelector('[data-fov="filter-bar"]') as HTMLElement;
  const segment = within(bar).getByRole("button", { name: "Radar" });
  expect(segment).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(segment);
  expect(segment).toHaveAttribute("aria-pressed", "true");
  await waitFor(() => expect(readoutShown()).toBe(true));
});

test("a full sheet, which hides the map, takes the button away with it", async () => {
  phone();
  restore.push(stubHeights({ "sheet-frame": 700, "sheet-head": 160, "sheet-body": 900 }));
  renderApp();
  await planDry();
  await morphTo(1);
  const b = floating()!;
  expect(sheet()).toHaveAttribute("data-detent", "peek");
  expect(b).not.toHaveAttribute("inert");

  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "half");
  expect(b).not.toHaveAttribute("inert");
  expect(b.style.opacity).toBe("1");

  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "full");
  expect(b).toHaveAttribute("inert");
  expect(b.style.opacity).toBe("0");
  expect(b.style.pointerEvents).toBe("none");

  fireEvent.click(within(summary()).getByText("By bike"));
  expect(sheet()).toHaveAttribute("data-detent", "peek");
  expect(b).not.toHaveAttribute("inert");
});

test("navigation keeps the button on a portrait phone, and puts it away on a phone on its side", async () => {
  phone();
  const { unmount } = renderApp();
  await planDry();
  await morphTo(1);
  fireEvent.click(within(summary()).getByRole("button", { name: "Start navigation" }));
  expect(screen.getByRole("button", { name: /exit navigation/i })).toBeInTheDocument();
  // The banner ends above the chip row's place, and the button is under that.
  expect(floating()).not.toHaveAttribute("inert");
  unmount();
  for (const r of restore.reverse()) r();
  restore = [];
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });

  // On its side the banner spans the top of the map pane, where the button would cover
  // its Exit.
  phone({ landscape: true });
  renderApp();
  await planDry();
  await morphTo(1);
  fireEvent.click(screen.getByRole("button", { name: "Start navigation" }));
  expect(screen.getByRole("button", { name: /exit navigation/i })).toBeInTheDocument();
  expect(floating()).toHaveAttribute("inert");
  expect(floating()!.style.opacity).toBe("0");
});
