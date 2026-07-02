import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { buildFrameTimes, parseLatestTime, useCloudFrames } from "./useCloudFrames";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const CAPS =
  `<Layer><Name>mtg_fd:rgb_geocolour</Name>` +
  `<Dimension name="time" default="2026-07-02T15:50:00.000Z" units="ISO8601">` +
  `2024-09-23T00:00:00.000Z/2026-07-02T15:50:00.000Z/PT10M</Dimension></Layer>`;

test("parseLatestTime reads the end of the layer's time extent", () => {
  expect(parseLatestTime(CAPS)).toBe("2026-07-02T15:50:00.000Z");
  expect(parseLatestTime("<Layer><Name>other</Name></Layer>")).toBeNull();
});

test("buildFrameTimes: eight 10-minute frames ending at the latest published one", () => {
  const frames = buildFrameTimes("2026-07-02T15:50:00.000Z");
  expect(frames).toHaveLength(8);
  expect(frames[0]).toBe("2026-07-02T14:40:00.000Z");
  expect(frames[7]).toBe("2026-07-02T15:50:00.000Z");
});

test("hook fetches capabilities and returns the frame times", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => CAPS })),
  );
  const { result } = renderHook(() => useCloudFrames(true), { wrapper });
  await waitFor(() => expect(result.current).toHaveLength(8));
  expect(result.current[7]).toBe("2026-07-02T15:50:00.000Z");
});
