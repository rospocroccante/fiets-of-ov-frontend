import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTripPlan } from "./useTripPlan";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
