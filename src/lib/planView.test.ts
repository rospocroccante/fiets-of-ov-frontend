import { buildPlanView } from "./planView";
import { mockPlanFor } from "../api/mock";

test("recommended option is first and transit is summarised by its lines", () => {
  const v = buildPlanView(mockPlanFor("A", "Bijlmer rain"));
  expect(v.recommendation).toBe("transit");
  expect(v.options[0].mode).toBe("transit");
  expect(v.options[0].recommended).toBe(true);
  expect(v.options[0].summary).toMatch(/Metro 52/);
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
