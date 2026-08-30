import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
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

// jsdom answers `false` to every media query, which is what keeps the whole existing
// suite (and the desktop layout it describes) on the unchanged path. A phone is the
// one query answering true; restore the real matchMedia afterwards or the next test in
// the file inherits a phone.
function phoneViewport(): () => void {
  const real = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: /max-width:\s*639\.98px/.test(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = real;
  };
}

// jsdom has no layout, so every offsetHeight is 0 and the phone geometry falls back to
// its desktop constants. These are the two boxes that geometry is solved from; give
// them the heights a real 390x844 phone measures and the arithmetic becomes testable.
function stubHeights(byName: Record<string, number>): () => void {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      const name = this.getAttribute("data-fov");
      return name != null && name in byName ? byName[name] : 0;
    },
  });
  return () => {
    if (original) Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  };
}

// Park the morph at a given progress. useMorphProgress divides window.scrollY by
// window.innerHeight, so this is the whole story.
async function morphTo(progress: number) {
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value: Math.round(window.innerHeight * progress),
  });
  await act(async () => {
    window.dispatchEvent(new Event("scroll"));
    // framer paints motion values on its own frame loop, so the opacity this test
    // reads only lands after one has run.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

function pillEntry(): HTMLElement {
  const pill = document.querySelector('[role="search"]') as HTMLElement;
  return within(pill).getByRole("button");
}

function startTrip() {
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
}

test("the map is not rendered until the user shows a sign of heading for it", async () => {
  // Order-independent: the global beforeEach in test/setup.ts resets lazyMap's "already
  // fetched" flag, so this starts from a cold home screen wherever it runs.
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

test("the controls added by the public-facing pass are 44px too", () => {
  renderApp();

  // The skip link is the first tab stop on the page and is only drawn while focused,
  // so its size lives on the focus: variant. Without the focus:not-sr-only beside it
  // the height would be moot: the link would never be drawn at all.
  const skip = screen.getByRole("link", { name: /skip to main content/i });
  expect(skip).toHaveClass("focus:min-h-[44px]", "focus:not-sr-only");

  // The home's own way into the privacy notice, at the foot of the page.
  const home = document.querySelector("#fov-home-main") as HTMLElement;
  const privacy = within(home).getByRole("button", { name: /^privacy$/i });
  expect(privacy).toHaveClass("min-h-[44px]");

  // And the notice's Close, which is an icon button: a thumb needs both dimensions.
  fireEvent.click(privacy);
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("button", { name: /close the privacy notice/i })).toHaveClass(
    "min-h-[44px]",
    "min-w-[44px]",
  );
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
  // By what each box is, not by where it sits in the child list: the sticky container
  // also holds the search pill and the home's background layer, and an index into it
  // silently starts asserting about the wrong element the day one is added.
  const mapStage = stage!.querySelector('[data-fov="map-stage"]') as HTMLElement;
  const homeStage = stage!.querySelector('[data-fov="home-stage"]') as HTMLElement;
  const header = stage!.querySelector("header") as HTMLElement;

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
  const homeStage = stage!.querySelector('[data-fov="home-stage"]') as HTMLElement;
  // The stage is absolutely positioned inside an overflow-hidden box and the page scroll
  // drives the morph instead of the content, so without its own scroller everything past
  // one viewport (at 390x844: the fourth popular trip, and all of HomeShortcuts) is
  // unreachable for good.
  expect(homeStage).toHaveClass("overflow-y-auto");
});

// ---------------------------------------------------------------------------
// The phone search path. Measured on a real 390x844 and 360x800 Chromium before any
// of this existed: the two fields in the pill were 63.4px and 48.4px wide, a typed
// "Amsterdam Zuid" needed 136px and was clipped to its tail, and the suggestion
// listbox inherited that width — a 61px box with 704px of content in it, every option
// wrapped over six or seven lines. What follows is the shape that replaced it.
// ---------------------------------------------------------------------------

test("on a phone the pill holds no text field: it holds one full-width way into a search screen", () => {
  const restore = phoneViewport();
  try {
    renderApp();
    const pill = document.querySelector('[role="search"]') as HTMLElement;
    // The two fields are gone from the pill, which is the only way they stop being
    // 63px wide: 354px of pill cannot hold two fields, two locate buttons, a swap and
    // a Search button and still leave either field usable.
    expect(pill.querySelectorAll("input")).toHaveLength(0);
    const entry = pillEntry();
    expect(entry).toHaveClass("w-full", "min-h-[44px]");
    expect(entry).toHaveAccessibleName(/plan your trip/i);
    expect(entry).toHaveAttribute("aria-haspopup", "dialog");

    fireEvent.click(entry);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Both fields, on a surface that owns the display rather than 63px of a pill.
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(2);
    expect(within(dialog).getByPlaceholderText("From")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("To")).toBeInTheDocument();
  } finally {
    restore();
  }
});

test("the phone search screen is where a trip gets planned, end to end", async () => {
  const restore = phoneViewport();
  try {
    renderApp();
    fireEvent.click(pillEntry());
    const dialog = screen.getByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: /^search$/i });
    // An incomplete trip is a dead end unless the screen says what is missing.
    expect(submit).toBeDisabled();
    expect(within(dialog).getByText(/add a start and a destination/i)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText("From"), {
      target: { value: "Centraal" },
    });
    fireEvent.change(within(dialog).getByPlaceholderText("To"), { target: { value: "Dam" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    // The screen gets out of the way and the plan is announced, exactly as the desktop
    // pill's Search does.
    expect(screen.queryByRole("dialog")).toBeNull();
    const region = document.querySelector('[aria-live="polite"]');
    await waitFor(() => expect(region).toHaveTextContent(/advice ready: \d+ options\./i));
    // …and the bar now reads as the trip, so the map stage says what is planned.
    expect(pillEntry()).toHaveTextContent("Centraal → Dam");
  } finally {
    restore();
  }
});

test("the phone search screen takes focus, and every way out gives it back", () => {
  const restore = phoneViewport();
  try {
    renderApp();
    const entry = pillEntry();
    entry.focus();
    fireEvent.click(entry);
    let dialog = screen.getByRole("dialog");
    // A mode change that leaves focus behind is a mode change a keyboard or screen
    // reader user cannot enter.
    expect(document.activeElement).toBe(within(dialog).getByPlaceholderText("From"));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(pillEntry());

    // The visible control has to work too: Escape is not discoverable on a phone.
    fireEvent.click(pillEntry());
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /close search/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(pillEntry());
  } finally {
    restore();
  }
});

test("with a trip already entered the phone screen opens on the destination", () => {
  const restore = phoneViewport();
  try {
    renderApp();
    fireEvent.click(pillEntry());
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("From"), {
      target: { value: "Centraal" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /close search/i }));

    fireEvent.click(pillEntry());
    dialog = screen.getByRole("dialog");
    // The start is settled; the reason to come back is the destination.
    expect(document.activeElement).toBe(within(dialog).getByPlaceholderText("To"));
  } finally {
    restore();
  }
});

test("every control on the phone search screen clears 44px, and its fields the 16px zoom floor", () => {
  const restore = phoneViewport();
  try {
    renderApp();
    fireEvent.click(pillEntry());
    const dialog = screen.getByRole("dialog");
    for (const name of [/close search/i, /swap start and end/i, /use my location/i]) {
      for (const button of within(dialog).getAllByRole("button", { name })) {
        expect(button).toHaveClass("min-h-[44px]", "min-w-[44px]");
      }
    }
    for (const combobox of within(dialog).getAllByRole("combobox")) {
      expect(combobox).toHaveClass("min-h-[44px]", "[@media(pointer:coarse)]:text-base");
    }
    // The primary action is a bar across the screen, not a 79px chip on a crowded row.
    expect(within(dialog).getByRole("button", { name: /^search$/i })).toHaveClass(
      "w-full",
      "min-h-[48px]",
    );
    // Clear appears only once there is something to clear, and is a finger-sized target.
    expect(within(dialog).queryByRole("button", { name: /clear from/i })).toBeNull();
    fireEvent.change(within(dialog).getByPlaceholderText("From"), {
      target: { value: "Centraal" },
    });
    expect(within(dialog).getByRole("button", { name: /clear from/i })).toHaveClass(
      "min-h-[44px]",
      "min-w-[44px]",
    );
  } finally {
    restore();
  }
});

test("the phone search screen speaks Dutch when the app does", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  const restore = phoneViewport();
  try {
    renderApp();
    expect(pillEntry()).toHaveTextContent("Waarheen?");
    fireEvent.click(pillEntry());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Plan je rit" })).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Van")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Naar")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Sluit het zoekscherm" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Vul een vertrekpunt en een bestemming in om te zoeken."),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText("Van"), { target: { value: "Centraal" } });
    expect(within(dialog).getByRole("button", { name: "Wis Van" })).toBeInTheDocument();
  } finally {
    restore();
  }
});

test("the desktop pill keeps its two fields, and the phone screen never mounts there", () => {
  // No phoneViewport(): this is the layout every other test in the suite renders.
  renderApp();
  const pill = document.querySelector('[role="search"]') as HTMLElement;
  expect(within(pill).getByPlaceholderText("From")).toBeInTheDocument();
  expect(within(pill).getByPlaceholderText("To")).toBeInTheDocument();
  expect(document.querySelector('[data-fov="search-entry"]')).toBeNull();
  expect(pill.getAttribute("data-rest-y")).toBe("260");
});

test("on a phone nothing the user scrolls can pass under the floating pill", () => {
  const restore = phoneViewport();
  try {
    const { container } = renderApp();
    const stage = container.querySelector(".sticky.top-0")!;
    const homeStage = stage.querySelector('[data-fov="home-stage"]') as HTMLElement;
    // One scroller with the pill hanging over its middle is what put the first popular
    // trip behind the pill at the bottom of the home; the column is what fixes it.
    expect(homeStage).not.toHaveClass("overflow-y-auto");
    expect(homeStage).toHaveClass("flex", "flex-col");

    const hero = homeStage.querySelector('[data-fov="home-hero"]') as HTMLElement;
    const slot = hero.nextElementSibling as HTMLElement;
    const scroller = slot.nextElementSibling as HTMLElement;
    // hero, then the hole the pill floats in, then everything that scrolls.
    expect(slot).toHaveAttribute("aria-hidden", "true");
    expect(scroller).toHaveClass("overflow-y-auto");
    // The headline is above the pill and does not move; the trips are below it and do.
    expect(hero.querySelector("h1")).not.toBeNull();
    expect(scroller.querySelector("h1")).toBeNull();
    expect(
      within(scroller).getByRole("button", { name: "Amsterdam Centraal → Vondelpark" }),
    ).toBeInTheDocument();
    // Including the footer that pushed that first card under the pill in the first place.
    expect(within(scroller).getByRole("button", { name: /^privacy$/i })).toBeInTheDocument();
  } finally {
    restore();
  }
});

test("on a phone the pill rests below the hero, not across its last line", () => {
  const restore = phoneViewport();
  const restoreHeights = stubHeights({ "home-hero": 196, "search-pill": 58 });
  try {
    renderApp();
    const pill = document.querySelector('[data-fov="search-pill"]') as HTMLElement;
    // 260 is the desktop constant, and at 260 the pill covered 23px of the subtitle's
    // last 24px line on every portrait phone. The offset follows the hero instead, so
    // a longer headline or a longer Dutch subtitle pushes the pill down with it.
    expect(Number(pill.getAttribute("data-rest-y"))).toBe(196 + 20);
    // And the hole left in the home covers the gap, the pill and the air below it, so
    // the scroller starts clear of the pill's bottom edge.
    const slot = document.querySelector('[data-fov="home-hero"]')!
      .nextElementSibling as HTMLElement;
    expect(slot.style.height).toBe(`${20 + 58 + 16}px`);
  } finally {
    restoreHeights();
    restore();
  }
});

test("half way through the morph the invisible home takes no taps", async () => {
  const { container } = renderApp();
  const stage = container.querySelector(".sticky.top-0")!;
  const mapStage = stage.querySelector('[data-fov="map-stage"]') as HTMLElement;
  const homeStage = stage.querySelector('[data-fov="home-stage"]') as HTMLElement;
  expect(homeStage).not.toHaveAttribute("inert");
  expect(homeStage).toHaveAttribute("role", "main");

  // The home is interpolated to opacity 0 at progress 0.5. Past that it is invisible,
  // and it used to keep pointer-events and stay out of inert until progress reached 1:
  // a real touch at the centre of the screen at 0.6 hit a popular-trip button nobody
  // could see and planned that trip.
  await morphTo(0.6);
  expect(homeStage.style.opacity).toBe("0");
  expect(homeStage.style.pointerEvents).toBe("none");
  expect(homeStage).toHaveAttribute("inert");
  // The landmark goes with it rather than pointing at a screen that is not there.
  expect(homeStage).not.toHaveAttribute("role");
  // The map is not live yet either, so nothing mid-morph answers a tap.
  expect(mapStage).toHaveAttribute("inert");
  expect(mapStage.style.pointerEvents).toBe("none");

  // Back on the home, everything is live again.
  await morphTo(0);
  expect(homeStage).not.toHaveAttribute("inert");
  expect(homeStage.style.pointerEvents).toBe("auto");
  expect(homeStage).toHaveAttribute("role", "main");
});

// The four tests below are DOM facts, not layout, which is why they belong here: an
// attribute is either on an element or it is not, and jsdom can say which. What jsdom
// cannot say is how wide, how tall, in front of what, or reachable by a finger — those
// live in browser-tests/, which measures them in a real Chrome at real device metrics.

test("the page behind the phone search screen is locked, inert and hidden", () => {
  const restore = phoneViewport();
  try {
    renderApp();
    const home = document.querySelector('[data-fov="home-stage"]') as HTMLElement;
    const map = document.querySelector('[data-fov="map-stage"]') as HTMLElement;
    expect(document.body.style.overflow).toBe("");

    fireEvent.click(pillEntry());
    // A swipe on the open screen used to scroll the document underneath it, which drove
    // the morph and left the user on the map when they closed the search.
    expect(document.body.style.overflow).toBe("hidden");
    for (const stage of [home, map]) {
      expect(stage).toHaveAttribute("inert");
      expect(stage).toHaveAttribute("aria-hidden", "true");
    }

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /close search/i }));
    expect(document.body.style.overflow).toBe("");
    for (const stage of [home, map]) {
      expect(stage).not.toHaveAttribute("aria-hidden");
    }
    expect(home).not.toHaveAttribute("inert");
  } finally {
    restore();
  }
});

test("closing the phone search screen puts the scroll back where it was", () => {
  const restore = phoneViewport();
  try {
    renderApp();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 485 });
    fireEvent.click(pillEntry());
    (window.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /close search/i }));
    // Making the viewport unscrollable is allowed to clamp the offset, so the offset is
    // recorded on the way in and written back on the way out.
    expect(window.scrollTo).toHaveBeenCalledWith(0, 485);
  } finally {
    // scrollY is the morph's only input; a test that leaves it parked mid-morph decides
    // the next test's stage, and the suite runs in a random order.
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    restore();
  }
});

test("the locate and swap controls leave the fields' rows on a phone", () => {
  const restore = phoneViewport();
  try {
    renderApp();
    fireEvent.click(pillEntry());
    const dialog = screen.getByRole("dialog");
    // One locate button for the screen, not one per field, and neither it nor the swap
    // is inside the card the two inputs share: that row is the input's, and the 44px
    // each of those controls used to take is what clipped "Amsterdam Sloterdijk".
    const locate = within(dialog).getAllByRole("button", { name: /use my location/i });
    expect(locate).toHaveLength(1);
    const swap = within(dialog).getByRole("button", { name: /swap start and end/i });
    for (const input of within(dialog).getAllByRole("combobox")) {
      const card = input.closest("div.rounded-card");
      expect(card).not.toBeNull();
      expect(card?.contains(locate[0])).toBe(false);
      expect(card?.contains(swap)).toBe(false);
    }
  } finally {
    restore();
  }
});

test("the map stage carries a back control on a phone, and only there", async () => {
  const restore = phoneViewport();
  try {
    renderApp();
    await morphTo(1);
    const back = screen.getByRole("button", { name: /back to home/i });
    // The wordmark beside it goes home and clears the trip; this only walks back.
    expect(back.closest("header")).not.toBeNull();
    (window.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    fireEvent.click(back);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
  } finally {
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    restore();
  }
});

test("the desktop header keeps its wordmark and gains no back arrow", () => {
  // No phoneViewport(): a header with room for a wordmark, a menu and a search pill
  // does not need a second way home in front of them.
  renderApp();
  expect(screen.queryByRole("button", { name: /back to home/i })).toBeNull();
  expect(screen.getByRole("button", { name: "Fiets of OV" })).toBeInTheDocument();
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
