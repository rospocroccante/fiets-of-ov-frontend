import { cycleDetent, detentHeights, nextDetent, rubberBand, snapDetent } from "./sheetDetents";

const H = detentHeights(700, 844, 34); // peek 166, half 422, full 700

test("heights follow the container, the viewport and the safe area", () => {
  expect(H).toEqual({ peek: 166, half: 422, full: 700 });
});

test("a short container clamps every detent to its own height", () => {
  expect(detentHeights(150, 844, 0)).toEqual({ peek: 132, half: 150, full: 150 });
  expect(detentHeights(0, 844, 0)).toEqual({ peek: 0, half: 0, full: 0 });
});

test.each([
  [200, 0, "peek"],
  [300, 0, "half"],
  [600, 0, "full"],
  [430, 400, "half"], // under the flick threshold: nearest
])("a slow release at %ipx settles on the nearest detent", (visible, growth, expected) => {
  expect(snapDetent(visible, growth, H)).toBe(expected);
});

test.each([
  [200, 800, "half"],
  [422, 800, "full"],
  [700, 800, "full"],
  [422, -800, "peek"],
  [600, -800, "half"],
  [166, -800, "peek"],
])("a flick from %ipx at %i px/s moves one detent that way", (visible, growth, expected) => {
  expect(snapDetent(visible, growth, H)).toBe(expected);
});

test("dragging past either end meets resistance", () => {
  expect(rubberBand(800, 166, 700)).toBeCloseTo(720);
  expect(rubberBand(100, 166, 700)).toBeCloseTo(152.8);
  expect(rubberBand(400, 166, 700)).toBe(400);
});

test("keyboard steps stop at the ends; a tap cycles", () => {
  expect(nextDetent("half", 1)).toBe("full");
  expect(nextDetent("full", 1)).toBe("full");
  expect(nextDetent("half", -1)).toBe("peek");
  expect(nextDetent("peek", -1)).toBe("peek");
  expect(cycleDetent("peek")).toBe("half");
  expect(cycleDetent("half")).toBe("full");
  expect(cycleDetent("full")).toBe("peek");
});
