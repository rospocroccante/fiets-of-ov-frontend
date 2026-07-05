import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import {
  __fireMapClick,
  __fireMapContextMenu,
  __fireMarkerDragEnd,
} from "./__mocks__/react-leaflet";

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

  // Drag the B pin to Vondelpark; App reverse-geocodes and re-plans.
  __fireMarkerDragEnd("end", 52.358, 4.8686);

  const toField = await screen.findByDisplayValue(/vondelpark/i);
  expect(toField).toBeInTheDocument();
});

test("right-click 'Directions from here' sets the From field", async () => {
  renderApp();
  startTrip();

  act(() => __fireMapContextMenu(52.358, 4.8686));
  fireEvent.click(await screen.findByRole("button", { name: /directions from here/i }));

  const fromField = await screen.findByDisplayValue(/vondelpark/i);
  expect(fromField).toBeInTheDocument();
});

test("right-click 'Directions to here' sets the To field", async () => {
  renderApp();
  startTrip();

  act(() => __fireMapContextMenu(52.358, 4.8686));
  fireEvent.click(await screen.findByRole("button", { name: /directions to here/i }));

  const toField = await screen.findByDisplayValue(/vondelpark/i);
  expect(toField).toBeInTheDocument();
});

test("What's here shows the place card; saving adds a home chip; From here fills the field", async () => {
  window.localStorage.clear();
  renderApp();
  startTrip();

  // Right-click near Vondelpark (a KNOWN mock place) and ask what's there.
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
  window.localStorage.clear();
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

test("menu clears recent searches", async () => {
  window.localStorage.clear();
  renderApp();
  startTrip();
  await waitFor(() => {
    const trips = JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]");
    if (trips.length === 0) throw new Error("not recorded yet");
  });
  fireEvent.click(screen.getByRole("button", { name: /menu/i }));
  fireEvent.click(screen.getByRole("button", { name: /clear recent searches/i }));
  expect(JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]")).toEqual([]);
});

test("Start begins navigation with the overlay up, recents untouched; Exit ends it", async () => {
  window.localStorage.clear();
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

  fireEvent.click(screen.getByRole("button", { name: /exit navigation/i }));
  expect(screen.queryByRole("button", { name: /exit navigation/i })).toBeNull();
});

test("swap exchanges the From and To fields", () => {
  renderApp();
  startTrip();

  fireEvent.click(screen.getByRole("button", { name: /swap start and end/i }));

  expect(screen.getByPlaceholderText("From")).toHaveValue("Dam");
  expect(screen.getByPlaceholderText("To")).toHaveValue("Centraal");
});
