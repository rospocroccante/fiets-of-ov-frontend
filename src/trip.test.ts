// This test imports from src/trip.ts to verify the module exists and exports the
// expected interfaces. The module-level import will cause a test file collection error
// if src/trip.ts does not exist at all (no type-only import trick).
import * as tripModule from "./trip";
import type { Endpoint, Trip, TripDraft } from "./trip";

test("trip module exports exist", () => {
  // The module must be importable (not null/undefined as a whole)
  expect(tripModule).toBeDefined();
});

test("Endpoint has label and query fields", () => {
  const ep: Endpoint = { label: "Amsterdam Centraal", query: "52.378620,4.900280" };
  expect(ep.label).toBe("Amsterdam Centraal");
  expect(ep.query).toBe("52.378620,4.900280");
});

test("Trip has from and to string fields", () => {
  const t: Trip = { from: "Centraal", to: "Dam" };
  expect(t.from).toBe("Centraal");
  expect(t.to).toBe("Dam");
});

test("TripDraft has from and to Endpoint fields", () => {
  const draft: TripDraft = {
    from: { label: "Centraal", query: "Centraal" },
    to: { label: "Dam", query: "Dam" },
  };
  expect(draft.from.label).toBe("Centraal");
  expect(draft.to.label).toBe("Dam");
});
