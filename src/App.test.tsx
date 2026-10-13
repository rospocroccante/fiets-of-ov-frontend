import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import {
  __fireMapClick,
  __fireMapContextMenu,
  __fireMarkerDragEnd,
} from "./__mocks__/react-leaflet";
import { whenMapMounted } from "./test/mapReady";
import { glassClasses } from "./test/glass";
import { waitForExit } from "./test/exit";

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

function startTrip() {
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Centraal" } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: "Dam" } });
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
}

test("home content is present at rest: headline and Popular trips", () => {
  renderApp();
  // The morph host folds in the retired HomeHero copy: a level-1 headline and the
  // "Popular trips" section are in the DOM at rest (opacity is style-driven, so we
  // assert DOM presence, not visibility).
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(screen.getByText(/popular trips/i)).toBeInTheDocument();
});

// The slogan's second line is one solid colour: the brand navy by day, NS geel at
// night. It was a sky-into-navy gradient clipped to the text; the colour stays in the
// aurora behind it.
test("the headline's second line is a solid brand colour, with no gradient", () => {
  renderApp();
  const line = screen.getByText("Let the weather decide.");
  expect(line.closest("h1")).toBe(screen.getByRole("heading", { level: 1 }));
  expect(line).toHaveClass("text-brand", "dark:text-night-accent");
  expect(line.className).not.toMatch(/gradient|bg-clip-text|text-transparent|from-|to-/);
});

// Each popular trip is one suggestion row, in the style of a maps app's suggestion list:
// a neutral pin in a neutral circle, the destination over "from {origin}", a chevron.
// One colour for every row. They were metro lines, four tracks in red, blue, green and
// yellow with ringed stations, and the owner found the colours clashed. Geometry and
// hit-testing are measured in browser-tests/.
test("the popular trips are suggestion rows led by their own orb", () => {
  const { container } = renderApp();
  const trips = [...container.querySelectorAll<HTMLElement>('[data-fov="popular-trip"]')];
  expect(trips).toHaveLength(4);
  const [first] = trips;
  expect(first.tagName).toBe("BUTTON");
  // The accessible name is the trip, as before the redesign.
  expect(first).toHaveAccessibleName("Amsterdam Centraal → Vondelpark");
  // The destination first, in the primary text, and the origin under it.
  const to = within(first).getByText("Vondelpark");
  const from = within(first).getByText("from Amsterdam Centraal");
  expect(to.compareDocumentPosition(from) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(to).toHaveClass("truncate", "font-semibold", "text-[15px]", "text-slate-900", "dark:text-night-text");
  expect(from).toHaveClass("truncate", "text-[13px]", "text-slate-800", "dark:text-night-muted");
  // Every row leads with its trip's orb, and a chevron at the end.
  const glyphs = trips.map((trip) => trip.querySelector('[data-fov="row-glyph"]'));
  for (const g of glyphs) {
    expect(g).toHaveAttribute("aria-hidden", "true");
    expect(g).toHaveClass("trip-orb");
    expect(g!.innerHTML).toBe(glyphs[0]!.innerHTML);
  }
  for (const trip of trips) {
    const chevron = trip.querySelector('[data-fov="row-chevron"]');
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveAttribute("aria-hidden", "true");
    expect(trip.lastElementChild).toBe(chevron);
    // At least 56px tall, no card and no shadow. The only thing styled per trip is the
    // orb, whose colours and phase the destination seeds.
    expect(trip).toHaveClass("min-h-16");
    expect([...trip.querySelectorAll("[style]")].every((el) => el.classList.contains("trip-orb"))).toBe(true);
    expect(glassClasses(trip)).toEqual([]);
    expect([...trip.classList].filter((c) => /^(bg-|border|shadow|ring)/.test(c))).toEqual([]);
  }
  expect(screen.queryByText("sports_score")).not.toBeInTheDocument();
  // A list, one column on a phone and two from `sm` up, each row on a hairline of its own.
  const list = first.closest("ul")!;
  expect(list).toHaveClass("grid-cols-1", "sm:grid-cols-2");
  expect(list.children).toHaveLength(4);
  for (const item of list.children) expect(item).toHaveClass("after:h-px", "after:bg-slate-200", "dark:after:bg-night-border");
});

test("map region and pickers are present in the DOM at rest (no search yet)", () => {
  renderApp();
  // The morph host no longer branches on trip === null; the map region (with its
  // pick toolbar) is always mounted. opacity/pointer-events are style-driven, so we
  // assert DOM presence, not visibility.
  expect(screen.getByText(/set on map/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^start$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^end$/i })).toBeInTheDocument();
});

test("submitting a search exercises getPlan and renders the recommended option", async () => {
  renderApp();
  startTrip();

  // getPlan (mock) resolves and the plan renders: the results count becomes non-zero.
  await waitFor(() => {
    const text = screen.getByText(/routes in area/i).textContent ?? "";
    if (text.startsWith("0")) throw new Error("plan still loading");
  });

  expect(screen.getByText(/routes in area/i)).toBeInTheDocument();
});

test("arming Start and clicking the map sets the From field to the reverse-geocoded name", async () => {
  renderApp();
  // Start a trip to advance to the map region (which shows the map + pickers).
  startTrip();

  // Arm the start endpoint and click the map near Vondelpark (a KNOWN mock place).
  fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
  await whenMapMounted();
  __fireMapClick(52.3581, 4.8687);

  // reverseGeocode is async: the From field updates to the mock name.
  const fromField = await screen.findByDisplayValue(/vondelpark/i);
  expect(fromField).toBeInTheDocument();
});

test("dragging the end pin re-plans and updates the To field to the reverse-geocoded name", async () => {
  renderApp();
  startTrip();

  // Wait for the plan to resolve so the B pin (draggable Marker) is rendered.
  await waitFor(() => {
    const text = screen.getByText(/routes in area/i).textContent ?? "";
    if (text.startsWith("0")) throw new Error("plan still loading");
  });

  // Drag the B pin to Vondelpark; App reverse-geocodes and re-plans. The map has to be
  // mounted first: the pin is a Marker inside it, and the mock only knows a marker's
  // drag handler once that Marker has rendered.
  await whenMapMounted();
  __fireMarkerDragEnd("end", 52.358, 4.8686);

  const toField = await screen.findByDisplayValue(/vondelpark/i);
  expect(toField).toBeInTheDocument();
});

test("right-click 'Directions from here' sets the From field", async () => {
  renderApp();
  startTrip();

  await whenMapMounted();
  act(() => __fireMapContextMenu(52.358, 4.8686));
  fireEvent.click(await screen.findByRole("button", { name: /directions from here/i }));

  const fromField = await screen.findByDisplayValue(/vondelpark/i);
  expect(fromField).toBeInTheDocument();
});

test("right-click 'Directions to here' sets the To field", async () => {
  renderApp();
  startTrip();

  await whenMapMounted();
  act(() => __fireMapContextMenu(52.358, 4.8686));
  fireEvent.click(await screen.findByRole("button", { name: /directions to here/i }));

  const toField = await screen.findByDisplayValue(/vondelpark/i);
  expect(toField).toBeInTheDocument();
});

test("What's here shows the place card; saving adds a home chip; From here fills the field", async () => {
  renderApp();
  startTrip();

  // Right-click near Vondelpark (a KNOWN mock place) and ask what's there.
  await whenMapMounted();
  act(() => __fireMapContextMenu(52.3581, 4.8687));
  fireEvent.click(await screen.findByRole("button", { name: /what's here/i }));

  // The card resolves the place and can save it.
  const saveBtn = await screen.findByRole("button", { name: /save this place/i });
  fireEvent.click(saveBtn);
  expect(screen.getByRole("button", { name: /remove from saved/i })).toBeInTheDocument();

  // Directions from the card fill the From field with the place name.
  fireEvent.click(screen.getByRole("button", { name: /^from here$/i }));
  expect(await screen.findByDisplayValue(/vondelpark/i)).toBeInTheDocument();
});

test("a successful search is recorded in recents (persisted locally)", async () => {
  renderApp();
  startTrip();
  await waitFor(() => {
    const raw = window.localStorage.getItem("fov.recentTrips.v1") ?? "[]";
    const trips = JSON.parse(raw) as Array<{ fromLabel: string }>;
    if (trips.length === 0) throw new Error("not recorded yet");
    expect(trips[0].fromLabel).toBe("Centraal");
  });
});

test("mode filter chips hide options for real: Transit off removes the transit card", async () => {
  renderApp();
  startTrip();
  await waitFor(() => {
    if ((screen.getByText(/routes in area/i).textContent ?? "").startsWith("0")) {
      throw new Error("plan still loading");
    }
  });
  expect(screen.getByText("Public transport")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Transit" }));
  expect(screen.queryByText("Public transport")).toBeNull();
  expect(screen.getByText(/1 routes in area/i)).toBeInTheDocument();
});

// The results arrive in sequence once per search (ResultsPanel keys its rows on it).
// What App owes the panel is a search identity that changes with a new plan and with
// nothing else. Choosing an option re-renders the same rows, and so does a filter chip
// for the rows it leaves alone; a row that re-mounted would arrive all over again.
test("the option rows arrive once per search, not again when another is chosen", async () => {
  renderApp();
  startTrip();
  await screen.findByText("Public transport");
  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-fov="option"]')];
  const first = rows();
  expect(first.length).toBeGreaterThan(1);

  // The same elements, not equal ones: toEqual would compare DOM nodes by structure.
  const same = (a: HTMLElement[], b: HTMLElement[]) => a.length === b.length && a.every((r, i) => r === b[i]);

  // Bike is the recommendation for this trip, so it starts chosen; choose the other.
  expect(rows()[0]).toHaveAttribute("data-selected", "true");
  fireEvent.click(screen.getByRole("heading", { name: "Public transport" }));
  expect(rows()[1]).toHaveAttribute("data-selected", "true");
  expect(same(rows(), first)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Transit" }));
  fireEvent.click(screen.getByRole("button", { name: "Transit" }));
  expect(rows().filter((r) => first.includes(r))).toHaveLength(first.length - 1);

  // The same route searched again is a new plan, with new departures: new rows.
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  await waitFor(() => expect(rows().some((r) => first.includes(r))).toBe(false));
  const skeleton = document.querySelector('[data-fov="results-skeleton"]');
  await screen.findByText("Public transport");
  expect(rows().length).toBe(first.length);
  if (skeleton) await waitForExit(skeleton);
});

test("menu clears recent searches", async () => {
  renderApp();
  startTrip();
  await waitFor(() => {
    const trips = JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]");
    if (trips.length === 0) throw new Error("not recorded yet");
  });
  fireEvent.click(screen.getByRole("button", { name: /menu/i }));
  const row = screen.getByRole("button", { name: /clear recent searches/i });
  fireEvent.click(row);
  expect(JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]")).toEqual([]);
  // The row closes the menu.
  await waitForExit(row);
});

test("Start begins navigation with the overlay up, recents untouched; Exit ends it", async () => {
  renderApp();
  startTrip();

  // Recording implies the plan is ready (the effect only fires on ready), so the
  // Start button is in the DOM and recents hold exactly the searched trip.
  await waitFor(() => {
    const trips = JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]");
    if (trips.length === 0) throw new Error("not recorded yet");
  });
  const recentsBefore = window.localStorage.getItem("fov.recentTrips.v1");

  fireEvent.click(screen.getByRole("button", { name: /start navigation/i }));

  // The first simulated fix is synchronous, so the banner is up without any timer
  // advancement. At the route start the proportional ETA is the full itinerary time.
  expect(screen.getByRole("button", { name: /exit navigation/i })).toBeInTheDocument();
  expect(screen.getByText(/~24 min/)).toBeInTheDocument();
  // Starting navigation must not touch the persisted recents.
  expect(window.localStorage.getItem("fov.recentTrips.v1")).toBe(recentsBefore);

  const exit = screen.getByRole("button", { name: /exit navigation/i });
  fireEvent.click(exit);
  expect(screen.queryByRole("button", { name: /exit navigation/i })).toBeNull();
  await waitForExit(exit);
});

test("Search keeps coordinates for endpoints set via the map (no free-text downgrade)", async () => {
  renderApp();
  startTrip();

  // Set the start from the map: the origin is now a coordinate endpoint whose label
  // fills the From field.
  await whenMapMounted();
  act(() => __fireMapContextMenu(52.3581, 4.8687));
  fireEvent.click(await screen.findByRole("button", { name: /directions from here/i }));
  await screen.findByDisplayValue(/vondelpark/i);

  // Re-submitting must keep those coordinates; rebuilding the endpoint from the
  // visible text would hand the geocoder a label it cannot resolve ("Current
  // location" after a nav replan hits the same path).
  fireEvent.click(screen.getByRole("button", { name: /search/i }));
  await waitFor(() => {
    const trips = JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]") as Array<{
      fromQuery: string;
    }>;
    if (trips.length === 0) throw new Error("not recorded yet");
    expect(trips[0].fromQuery).toMatch(/^52\.\d+,4\.\d+$/);
  });
});

test("swap exchanges the From and To fields", () => {
  renderApp();
  startTrip();

  fireEvent.click(screen.getByRole("button", { name: /swap start and end/i }));

  expect(screen.getByPlaceholderText("From")).toHaveValue("Dam");
  expect(screen.getByPlaceholderText("To")).toHaveValue("Centraal");
});
