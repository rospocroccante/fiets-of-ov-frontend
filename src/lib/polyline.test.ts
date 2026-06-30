import { decodePolyline } from "./polyline";

test("decodes the canonical example polyline", () => {
  // Classic Google example -> (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
  const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  expect(pts).toHaveLength(3);
  expect(pts[0][0]).toBeCloseTo(38.5, 4);
  expect(pts[0][1]).toBeCloseTo(-120.2, 4);
  expect(pts[2][0]).toBeCloseTo(43.252, 3);
  expect(pts[2][1]).toBeCloseTo(-126.453, 3);
});

test("empty string decodes to no points", () => {
  expect(decodePolyline("")).toEqual([]);
});
