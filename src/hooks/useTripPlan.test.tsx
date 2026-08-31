import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getPlan } from "../api/client";
import { useTripPlan } from "./useTripPlan";
import type { Trip } from "../trip";

// The real (mock-mode) planner, wrapped in a spy: the refetch test needs to count
// calls, everything else behaves exactly as before.
vi.mock("../api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/client")>();
  return { ...actual, getPlan: vi.fn(actual.getPlan) };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// A wrapper whose client survives rerenders: `wrapper` above builds a fresh one on
// every render, which would empty the cache and hide any missing refetch.
function persistentWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Persistent({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

test("resolves to ready with recommended-first options in mock mode", async () => {
  const { result } = renderHook(() => useTripPlan({ from: "Centraal", to: "Bijlmer rain" }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.view?.options[0].mode).toBe("transit");
  expect(result.current.origin).not.toBeNull();
  expect(result.current.destination).not.toBeNull();
});

test("idle when trip is null", () => {
  const { result } = renderHook(() => useTripPlan(null), { wrapper });
  expect(result.current.status).toBe("idle");
});

test("react-query's abort signal reaches the fetch chain", async () => {
  vi.mocked(getPlan).mockClear();
  const { result } = renderHook(() => useTripPlan({ from: "Centraal", to: "Dam" }), { wrapper });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  // getPlan(from, to, signal): a superseded query must be able to abort its own request.
  expect(vi.mocked(getPlan).mock.calls[0][2]).toBeInstanceOf(AbortSignal);
});

test("re-submitting the same route re-plans instead of replaying the cached answer", async () => {
  vi.mocked(getPlan).mockClear();
  const { result, rerender } = renderHook(({ trip }: { trip: Trip }) => useTripPlan(trip), {
    wrapper: persistentWrapper(),
    initialProps: { trip: { from: "Centraal", to: "Dam", submit: 1 } },
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(getPlan).toHaveBeenCalledTimes(1);

  // Same endpoints, second Search: departure times have aged, so it must go again.
  rerender({ trip: { from: "Centraal", to: "Dam", submit: 2 } });
  await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(result.current.status).toBe("ready"));

  // A re-render that is not a new submit still comes from the cache.
  rerender({ trip: { from: "Centraal", to: "Dam", submit: 2 } });
  expect(getPlan).toHaveBeenCalledTimes(2);
});
