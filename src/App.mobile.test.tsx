import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { whenMapMounted } from "./test/mapReady";
import { isMapLoaded, mapChunkRequests } from "./components/lazyMap";

// The mobile pass's own guardrails: the map chunk stays out of the first render, the
// plan outcome is announced out of band, and the controls a thumb has to hit keep their
// minimum size. Everything here mounts the real provider tree (see README): the language
// of the announcement is part of what is being checked.
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

function startTrip() {
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
}

beforeEach(() => {
  window.localStorage.clear();
});

test("the map is not rendered until the user shows a sign of heading for it", async () => {
  // This test has to be the first in the file to touch the map: lazyMap's "already
  // fetched" flag is module state and survives to the next test (see test/mapReady).
  const { container } = renderApp();

  // First paint: no map, and nothing has asked for the leaflet chunk. That is the whole
  // point of the split — a visitor who reads the home and leaves never downloads it.
  expect(container.querySelector(".leaflet-container")).toBeNull();

  // An empty pane on the first frame proves nothing on its own: React.lazy suspends
  // during its first render too, so a version that renders the map unconditionally looks
  // exactly like this until its import resolves a tick later. The request counter is the
  // synchronous difference — nothing has *reached* for the chunk yet.
  expect(mapChunkRequests()).toBe(0);
  expect(isMapLoaded()).toBe(false);

  // What holds the pane open instead is a placeholder with the map container's own box:
  // same size, same corner radius, so the swap cannot shift the layout or flash a hole
  // in the middle of the morph.
  const placeholder = container.querySelector('[aria-hidden="true"].rounded-card');
  expect(placeholder).not.toBeNull();
  expect(placeholder).toHaveClass("h-full", "w-full", "rounded-card");

  await whenMapMounted();
  expect(container.querySelector(".leaflet-container")).not.toBeNull();
});

test("a finished plan is announced in a polite live region", async () => {
  renderApp();
  const region = document.querySelector('[aria-live="polite"]');
  expect(region).not.toBeNull();
  // Idle says nothing: the region must only ever speak on an outcome.
  expect(region).toHaveTextContent("");

  startTrip();
  await waitFor(() => expect(region).toHaveTextContent(/advice ready: \d+ options\./i));
});

test("the announcement is translated, like everything else the user hears", async () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  renderApp();
  fireEvent.change(screen.getByPlaceholderText("Van"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("Naar"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /zoeken/i }));

  const region = document.querySelector('[aria-live="polite"]');
  await waitFor(() => expect(region).toHaveTextContent(/advies klaar: \d+ opties\./i));
});

test("the live region is announced, not drawn", () => {
  renderApp();
  // sr-only, or the same sentence appears twice on a screen that has no room for it.
  expect(document.querySelector('[aria-live="polite"]')).toHaveClass("sr-only");
});

test("every control in the search pill is at least 44px in its constrained direction", () => {
  renderApp();
  // The pill is the one row a phone user always touches, and before this pass its
  // controls measured 22x24 (swap), 38x38 (locate) and 61x36 (the fields).
  for (const name of [/swap start and end/i, /search/i]) {
    expect(screen.getByRole("button", { name })).toHaveClass("min-h-[44px]");
  }
  for (const locate of screen.getAllByRole("button", { name: /use my location/i })) {
    expect(locate).toHaveClass("min-h-[44px]", "min-w-[44px]");
  }
  expect(screen.getByRole("button", { name: /swap start and end/i })).toHaveClass("min-w-[44px]");
  for (const field of [screen.getByPlaceholderText("From"), screen.getByPlaceholderText("To")]) {
    expect(field).toHaveClass("min-h-[44px]");
    // iOS zooms the page when a focused input is under 16px; the condition is the
    // pointer, not a width breakpoint (a phone in landscape is wider than `sm`).
    expect(field).toHaveClass("[@media(pointer:coarse)]:text-base");
  }
});

test("the home's language and theme pills are 44px square", () => {
  renderApp();
  for (const name of [/switch language/i, /switch to dark mode/i]) {
    expect(screen.getByRole("button", { name })).toHaveClass("min-h-[44px]", "min-w-[44px]");
  }
});

test("the stage that is off screen is inert, so Tab and screen readers skip it", async () => {
  const { container } = renderApp();
  const stage = container.querySelector(".sticky.top-0");
  const [mapStage, homeStage, header] = Array.from(stage!.children) as HTMLElement[];

  // At rest the home owns the screen: the map stage and the map-only header are both
  // fully rendered underneath it, and both must be unreachable.
  expect(mapStage).toHaveAttribute("inert");
  expect(header).toHaveAttribute("inert");
  expect(homeStage).not.toHaveAttribute("inert");
  // Exactly one main landmark is exposed, and at rest it is the home.
  expect(homeStage).toHaveAttribute("role", "main");
  expect(container.querySelectorAll("main")).toHaveLength(1);
});

test("the home stage can scroll its own content, so nothing below the fold is stranded", () => {
  const { container } = renderApp();
  const stage = container.querySelector(".sticky.top-0");
  const homeStage = stage!.children[1] as HTMLElement;
  // The stage is absolutely positioned inside an overflow-hidden box and the page scroll
  // drives the morph instead of the content, so without its own scroller everything past
  // one viewport (at 390x844: the fourth popular trip, and all of HomeShortcuts) is
  // unreachable for good.
  expect(homeStage).toHaveClass("overflow-y-auto");
});

test("intent fetches the map chunk exactly once, however many signals arrive", async () => {
  renderApp();
  await whenMapMounted();
  const afterFirst = mapChunkRequests();
  expect(afterFirst).toBeGreaterThan(0);

  // More scrolling, more taps: the listeners are gone and the module is cached, so
  // nothing reaches for it again.
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new Event("touchstart"));
  window.dispatchEvent(new Event("pointerdown"));
  expect(mapChunkRequests()).toBe(afterFirst);
});
