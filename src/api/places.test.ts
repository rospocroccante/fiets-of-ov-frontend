import { mockSearchPlaces } from "./mock";
import { searchPlaces } from "./client";

test("mockSearchPlaces matches by substring, case-insensitive", () => {
  const r = mockSearchPlaces("vondel");
  expect(r.length).toBeGreaterThan(0);
  expect(r[0].name.toLowerCase()).toContain("vondel");
});

test("mockSearchPlaces returns [] for empty query", () => {
  expect(mockSearchPlaces("   ")).toEqual([]);
});

test("mockSearchPlaces caps results at 6", () => {
  expect(mockSearchPlaces("a").length).toBeLessThanOrEqual(6);
});

test("searchPlaces (mock mode) resolves to fixture places", async () => {
  const r = await searchPlaces("centraal");
  expect(r.some((p) => p.name.toLowerCase().includes("centraal"))).toBe(true);
});
