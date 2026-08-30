import { render, screen, fireEvent, act } from "@testing-library/react";
import { PlaceInput } from "./PlaceInput";
import { searchPlaces } from "../api/client";
import type { Place } from "../api/types";

// Own file: searchPlaces is module-mocked with manually-resolved promises so the test
// can complete two lookups out of order; the other PlaceInput tests use the real
// (mock-mode) geocoder.
vi.mock("../api/client", () => ({ searchPlaces: vi.fn() }));

const place = (name: string): Place => ({
  id: name,
  name,
  label: `${name}, Amsterdam`,
  lat: 52.37,
  lon: 4.89,
});

// Past the 150 ms debounce.
const afterDebounce = () => act(() => new Promise((r) => setTimeout(r, 200)));

test("a stale suggestion response cannot overwrite the newer query's list", async () => {
  const resolvers: Array<(places: Place[]) => void> = [];
  const signals: Array<AbortSignal | undefined> = [];
  vi.mocked(searchPlaces).mockImplementation(
    (_q: string, signal?: AbortSignal) =>
      new Promise((resolve) => {
        signals.push(signal);
        resolvers.push(resolve);
      }),
  );

  render(<PlaceInput value="" placeholder="From" onChange={() => {}} onSelect={() => {}} />);
  const input = screen.getByPlaceholderText("From");

  // Two lookups in flight: the slow "vond", then "vondelpark".
  fireEvent.change(input, { target: { value: "vond" } });
  await afterDebounce();
  fireEvent.change(input, { target: { value: "vondelpark" } });
  await afterDebounce();
  expect(resolvers).toHaveLength(2);

  // The superseded request is cancelled, not merely ignored.
  expect(signals[0]?.aborted).toBe(true);
  expect(signals[1]?.aborted).toBe(false);

  // The newer answer lands first, the stale one arrives late and must lose.
  await act(async () => resolvers[1]([place("Vondelpark")]));
  await act(async () => resolvers[0]([place("Vondelstraat")]));

  expect(screen.getByText("Vondelpark")).toBeInTheDocument();
  expect(screen.queryByText("Vondelstraat")).toBeNull();
});

test("a failed lookup empties the list instead of rejecting unhandled", async () => {
  vi.mocked(searchPlaces).mockRejectedValue(new Error("network down"));
  const onUnhandled = vi.fn();
  window.addEventListener("unhandledrejection", onUnhandled);
  try {
    render(<PlaceInput value="" placeholder="From" onChange={() => {}} onSelect={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: "vondel" } });
    await afterDebounce();

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onUnhandled).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("unhandledrejection", onUnhandled);
  }
});
