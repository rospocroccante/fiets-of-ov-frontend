import { EDGE_ALL, fitEdge } from "./mapEdge";

// The map's right edge on a portrait phone with the radar on: the readout starts at 184
// (12px under a 116px chrome, the 48px button and 8px of air), its toggles are 32px tall
// and the rest of it 53, the place chip is 44 and the reset 48. `foot` is the reset's top.
const PARTS = { top: 184, readout: true, toggles: 32, extras: 53, places: 44, reset: true };
const resetTop = (screen: number, sheet: number) => screen - 12 - sheet - 48;

test("with room for all of it, everything is drawn", () => {
  // 390x844 at half: 178px between the readout's top and the reset.
  expect(fitEdge({ ...PARTS, foot: resetTop(844, 422) })).toEqual(EDGE_ALL);
  // 320x568 collapsed.
  expect(fitEdge({ ...PARTS, foot: resetTop(568, 165) })).toEqual(EDGE_ALL);
});

test("320x568 at half: the toggles stay, the place chips and the rest of the readout go", () => {
  // 40px: the toggles and their air, exactly.
  expect(fitEdge({ ...PARTS, foot: resetTop(568, 284) })).toEqual({ toggles: true, places: false, extras: false });
});

test("the place chips come before the clock and the legend", () => {
  // Room for the toggles (40) and the chip (52), not for the rest of the readout (59).
  expect(fitEdge({ ...PARTS, foot: 184 + 100 })).toEqual({ toggles: true, places: true, extras: false });
});

test("with no room for the toggles the readout is not drawn, and the chips still clear the button", () => {
  expect(fitEdge({ ...PARTS, foot: 184 + 30 })).toEqual({ toggles: false, places: false, extras: false });
  // The radar off: the chip may stand anywhere under the button's air.
  expect(fitEdge({ ...PARTS, readout: false, foot: 184 + 52 })).toEqual({ toggles: false, places: true, extras: false });
  expect(fitEdge({ ...PARTS, readout: false, foot: 184 + 51 })).toEqual({ toggles: false, places: false, extras: false });
});

test("with the reset elsewhere (a phone on its side) the chips need no air under them", () => {
  // 844x390: the column is the chip alone, its foot 250px down a 262px map.
  expect(fitEdge({ ...PARTS, top: 68, foot: 250, reset: false })).toEqual(EDGE_ALL);
  expect(fitEdge({ ...PARTS, readout: false, top: 68, foot: 68 + 44, reset: false }).places).toBe(true);
});

test("a fit that is exact on paper survives a fractional measurement", () => {
  expect(fitEdge({ ...PARTS, toggles: 32.3, foot: resetTop(568, 284) }).toggles).toBe(true);
});
