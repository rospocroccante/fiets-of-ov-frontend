import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTripAdvice } from "./useTripAdvice";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

test("resolves to ready with recommended-first cards in mock mode", async () => {
  const { result } = renderHook(() => useTripAdvice({ from: "Centraal", to: "Bijlmer rain" }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.status).toBe("ready"));
  expect(result.current.result?.cards[0].mode).toBe("transit");
  expect(result.current.origin).not.toBeNull();
  expect(result.current.destination).not.toBeNull();
});

test("idle when trip is null", () => {
  const { result } = renderHook(() => useTripAdvice(null), { wrapper });
  expect(result.current.status).toBe("idle");
});
