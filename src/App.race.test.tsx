import { render, screen, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { __fireMapContextMenu } from "./__mocks__/react-leaflet";
import { whenMapMounted } from "./test/mapReady";
import { reverseGeocode } from "./geocode";

// Own file: reverseGeocode is module-mocked with manually-resolved promises so the
// test can complete two lookups out of order; the other App tests use the real
// (mock-mode) geocoder.
vi.mock("./geocode", () => ({ reverseGeocode: vi.fn() }));

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
