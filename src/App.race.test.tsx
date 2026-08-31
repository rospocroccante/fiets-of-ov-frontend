import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { __fireMapContextMenu } from "./__mocks__/react-leaflet";
import { whenMapMounted } from "./test/mapReady";
import { reverseGeocode, reverseGeocodeDetail } from "./geocode";

// Own file: reverseGeocode is module-mocked with manually-resolved promises so the
// test can complete two lookups out of order; the other App tests use the real
// (mock-mode) geocoder.
vi.mock("./geocode", () => ({ reverseGeocode: vi.fn(), reverseGeocodeDetail: vi.fn() }));

test("a stale reverse-geocode response cannot overwrite a newer pick", async () => {
  const resolvers: Array<(label: string) => void> = [];
  vi.mocked(reverseGeocode).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );

  await whenMapMounted();
  // Two rapid "Directions from here" picks at different spots.
  act(() => __fireMapContextMenu(52.36, 4.88, 10, 20));
  fireEvent.click(await screen.findByRole("button", { name: /directions from here/i }));
  act(() => __fireMapContextMenu(52.4, 4.9, 10, 20));
  fireEvent.click(await screen.findByRole("button", { name: /directions from here/i }));

  expect(resolvers).toHaveLength(2);
  // The newer pick's lookup returns first; the stale one arrives late and must lose.
  await act(async () => resolvers[1]("Second Pick"));
  await act(async () => resolvers[0]("First Pick"));

  expect(screen.getByDisplayValue("Second Pick")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("First Pick")).toBeNull();
});

test("a location fix cannot overwrite text typed after the locate started", async () => {
  const resolvers: Array<(label: string) => void> = [];
  vi.mocked(reverseGeocode).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  );
  // jsdom ships no geolocation; an instant fix stands in for the GPS so the reverse geocode is the only thing left pending.
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: (
        ok: (pos: { coords: { latitude: number; longitude: number; accuracy: number } }) => void,
      ) => ok({ coords: { latitude: 52.36, longitude: 4.88, accuracy: 10 } }),
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  try {
    // The From field's own locate button on the desktop pill.
    fireEvent.click(screen.getAllByRole("button", { name: /use my location/i })[0]);
    await act(async () => {});
    expect(resolvers).toHaveLength(1);

    // The user types over the From field while the lookup is still out: the late fix must lose.
    fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "Dam" } });
    await act(async () => resolvers[0]("Somewhere Else"));

    expect(screen.getByDisplayValue("Dam")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Somewhere Else")).toBeNull();
  } finally {
    delete (navigator as { geolocation?: unknown }).geolocation;
  }
});

test("a closed What's-here card is not re-opened by a late answer", async () => {
  const detailResolvers: Array<(d: { name: string; address: string | null }) => void> = [];
  vi.mocked(reverseGeocodeDetail).mockImplementation(
    () =>
      new Promise((resolve) => {
        detailResolvers.push(resolve);
      }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
  await whenMapMounted();

  // The first lookup answers and opens the card.
  act(() => __fireMapContextMenu(52.36, 4.88, 10, 20));
  fireEvent.click(await screen.findByRole("button", { name: /what's here/i }));
  expect(detailResolvers).toHaveLength(1);
  await act(async () => detailResolvers[0]({ name: "First Spot", address: null }));
  expect(screen.getByText("First Spot")).toBeInTheDocument();

  // A second lookup is still out when the user closes the card: its answer may not re-open it.
  act(() => __fireMapContextMenu(52.4, 4.9, 10, 20));
  fireEvent.click(await screen.findByRole("button", { name: /what's here/i }));
  fireEvent.click(screen.getByRole("button", { name: /close place info/i }));
  await act(async () => detailResolvers[1]({ name: "Second Spot", address: null }));

  expect(screen.queryByText("Second Spot")).toBeNull();
});
