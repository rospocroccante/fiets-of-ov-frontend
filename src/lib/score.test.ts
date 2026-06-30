import { scoreAdvice } from "./score";
import { mockAdviceFor } from "../api/mock";

test("recommended card is first and badged", () => {
  const r = scoreAdvice(mockAdviceFor("A", "Bijlmer rain"));
  expect(r.recommendation).toBe("transit");
  expect(r.cards[0].mode).toBe("transit");
  expect(r.cards[0].recommended).toBe(true);
  expect(r.cards[1].recommended).toBe(false);
});

test("bike card shows dry chip when not raining", () => {
  const r = scoreAdvice(mockAdviceFor("A", "Vondelpark"));
  const bike = r.cards.find((c) => c.mode === "bike")!;
  expect(bike.chips.some((c) => c.toLowerCase().includes("dry"))).toBe(true);
});

test("null transit minutes renders an unavailable chip", () => {
  const r = scoreAdvice(mockAdviceFor("A", "Polder remote"));
  const transit = r.cards.find((c) => c.mode === "transit")!;
  expect(transit.minutes).toBeNull();
  expect(transit.chips.some((c) => c.toLowerCase().includes("no line"))).toBe(true);
});

test("degraded forecast shows meteo-unavailable chip on bike card", () => {
  const r = scoreAdvice(mockAdviceFor("A", "Unknown spot"));
  const bike = r.cards.find((c) => c.mode === "bike")!;
  expect(bike.chips.some((c) => c.toLowerCase().includes("unavailable"))).toBe(true);
});

test("reason lives on the recommended card", () => {
  const r = scoreAdvice(mockAdviceFor("A", "Vondelpark"));
  expect(r.cards[0].reason).toBeTruthy();
  expect(r.cards[1].reason).toBeUndefined();
});
