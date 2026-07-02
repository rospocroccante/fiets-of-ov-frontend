import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRainRadar } from "./useRainRadar";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const past = Array.from({ length: 13 }, (_, i) => ({
  time: 1000 + i * 600,
  path: `/v2/radar/${1000 + i * 600}`,
}));
const nowcast = [
  { time: 9000, path: "/v2/radar/nowcast_9000" },
  { time: 9600, path: "/v2/radar/nowcast_9600" },
  { time: 10200, path: "/v2/radar/nowcast_10200" },
];

test("builds tile URLs from the RainViewer index: last 6 past frames + 2 nowcast", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ host: "https://tc.test", radar: { past, nowcast } }),
    })),
  );

  const { result } = renderHook(() => useRainRadar(true), { wrapper });

  await waitFor(() => expect(result.current).toHaveLength(8));
  // First frame is the 7th-from-last past snapshot; last is the second nowcast.
  expect(result.current[0].time).toBe(past[7].time);
  expect(result.current[0].url).toBe(
    `https://tc.test/v2/radar/${past[7].time}/256/{z}/{x}/{y}/2/1_1.png`,
  );
  expect(result.current[7].time).toBe(9600);
  expect(result.current[7].url).toBe(
    "https://tc.test/v2/radar/nowcast_9600/256/{z}/{x}/{y}/2/1_1.png",
  );
});

test("disabled hook never fetches", () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderHook(() => useRainRadar(false), { wrapper });
  expect(fetchMock).not.toHaveBeenCalled();
});
