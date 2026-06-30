import { buildPlanView } from "./planView";
import { mockPlanFor } from "../api/mock";

test("recommended option is first; transit summarised by its lines", () => {
  const v = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  expect(v.options[0].recommended).toBe(true);
  expect(v.options[0].mode).toBe(v.recommendation);
  expect(v.recommendation).toBe("transit");
  const transit = v.options.find((o) => o.mode === "transit");
  expect(transit?.summary).toMatch(/Metro 52/);
});

test("bike-and-ride option is summarised with bike + line", () => {
  const v = buildPlanView(mockPlanFor("A", "Zuid mix"));
  const mix = v.options.find((o) => o.mode === "bike_and_ride");
  expect(mix).toBeTruthy();
  expect(mix?.summary).toMatch(/bike \d+ min/i);
  expect(mix?.summary).toMatch(/Metro 52/);
});

test("bike-only plan yields a single option summarised in km", () => {
  const v = buildPlanView(mockPlanFor("A", "Polder remote"));
  expect(v.options).toHaveLength(1);
  expect(v.options[0].mode).toBe("bike");
  expect(v.options[0].summary).toMatch(/km/);
});

test("carries the rain fields through", () => {
  const v = buildPlanView(mockPlanFor("A", "Unknown spot"));
  expect(v.rainExpected).toBeNull();
});
