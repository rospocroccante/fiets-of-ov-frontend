// The right edge of the map, top to bottom: the radar button (a phone's), the radar's
// readout under it, then the place chips and the reset, which stand on the bottom column's
// foot and ride a results sheet up. The button and the reset never move. Between them
// the room goes, in this order, to the readout's Rain and Wind toggles, to the place
// chips, and to the rest of the readout (the frame clock, the error chips, the legend).
// A part that does not fit whole is not drawn at all, so nothing on this edge ever covers
// another control, and what a rider is most likely to want stays longest.
//
// The case that needs it: 320x568 with the sheet at half leaves 168px of map between the
// chips and the sheet. The readout (91px) covered the reset, and the place chip ran into
// the radar button. There, the edge is the button, the two toggles and the reset.
//
// Pure, so MapView only measures and applies. Every number is a distance down the map in
// CSS pixels.

// The air between the readout and the bottom column, and between the column's own parts
// (MapView's gap-2).
export const EDGE_AIR = 8;
// Between the readout's toggles and the rest of it (RadarReadout's gap-1.5).
const READOUT_GAP = 6;

export interface EdgeSizes {
  // Where the readout's column starts: under the radar button and its air, or the map's
  // top margin where there is no button.
  top: number;
  // The top of the reset when it stands in the bottom column, or the column's foot.
  foot: number;
  // Whether the readout is up at all.
  readout: boolean;
  // Measured heights, 0 for a part that is not there.
  toggles: number;
  extras: number;
  places: number;
  // Whether the reset stands under the place chips, with EDGE_AIR between them.
  reset: boolean;
}

// What is drawn. With no readout up, `toggles` and `extras` are false.
export interface EdgeFit {
  toggles: boolean;
  places: boolean;
  extras: boolean;
}

export const EDGE_ALL: EdgeFit = { toggles: true, places: true, extras: true };

// Half a pixel of slack: measured boxes are fractional, and a fit that is exact on paper
// (the toggles at 320x568, half) must not lose to rounding.
const SLACK = 0.5;

export function fitEdge({ top, foot, readout, toggles, extras, places, reset }: EdgeSizes): EdgeFit {
  const room = foot - top;
  let used = 0;
  const fits = (h: number) => used + h <= room + SLACK;
  const showToggles = readout && fits(toggles + EDGE_AIR);
  if (showToggles) used += toggles + EDGE_AIR;
  const placesNeed = places + (reset ? EDGE_AIR : 0);
  const showPlaces = places > 0 && fits(placesNeed);
  if (showPlaces) used += placesNeed;
  const showExtras = showToggles && extras > 0 && fits(READOUT_GAP + extras);
  return { toggles: showToggles, places: showPlaces, extras: showExtras };
}

export function sameFit(a: EdgeFit, b: EdgeFit): boolean {
  return a.toggles === b.toggles && a.places === b.places && a.extras === b.extras;
}

// A part given up for room: out of the flow, so it takes no space, and hidden, so it takes
// no touch and no focus, but still laid out, so it can be measured for when there is room
// again.
export const OUT_OF_ROOM = { position: "absolute", visibility: "hidden" } as const;
