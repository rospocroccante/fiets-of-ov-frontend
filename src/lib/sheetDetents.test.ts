import { cycleDetent, detentHeights, hugs, nextDetent, rubberBand, snapDetent } from "./sheetDetents";

// A 390x844 phone: the frame under the floating chrome is 700px, the bottom inset 34px.
const PHONE = { container: 700, viewport: 844, safeBottom: 34 };

// A header 132px tall over content far taller than the screen: peek 166, half 422, full 700.
const H = detentHeights({ ...PHONE, header: 132, content: 900 });

test("peek is the measured header above the bottom inset; half is half the window", () => {
  expect(H).toEqual({ peek: 166, half: 422, full: 700 });
  expect(detentHeights({ ...PHONE, header: 160, content: 900 }).peek).toBe(194);
  expect(hugs(H)).toBe(false);
});

test("full stops where the content ends when that is short of the frame", () => {
  // 160 + 400 = 560: more than half, less than the frame.
  expect(detentHeights({ ...PHONE, safeBottom: 0, header: 160, content: 400 })).toEqual({
    peek: 160,
    half: 422,
    full: 560,
  });
});

test("content that fits under half: one resting height, exactly as tall as it", () => {
  const h = detentHeights({ ...PHONE, header: 160, content: 200 });
  expect(h).toEqual({ peek: 360, half: 360, full: 360 });
  expect(hugs(h)).toBe(true);
  // Exactly half still hugs: there is nothing more to open to.
  expect(hugs(detentHeights({ ...PHONE, header: 160, content: 262 }))).toBe(true);
  expect(hugs(detentHeights({ ...PHONE, header: 160, content: 263 }))).toBe(false);
});

test("no content (loading, an error): the header alone, hugged", () => {
  const h = detentHeights({ ...PHONE, header: 120, content: 0 });
  expect(h).toEqual({ peek: 154, half: 154, full: 154 });
  expect(hugs(h)).toBe(true);
});

test("a short container clamps every detent to its own height", () => {
  expect(detentHeights({ container: 150, viewport: 844, safeBottom: 0, header: 160, content: 900 })).toEqual({
    peek: 150,
    half: 150,
    full: 150,
  });
  expect(detentHeights({ container: 0, viewport: 844, safeBottom: 0, header: 0, content: 0 })).toEqual({
    peek: 0,
    half: 0,
    full: 0,
  });
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
