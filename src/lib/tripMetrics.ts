import type { Itinerary, PlanLeg } from "../api/types";

// What a single itinerary costs the traveller, the atmosphere and the legs.
// Everything here is derived client-side from the distance and mode the planner
// already sends per leg; the backend supplies none of it, and none of it is a quote.
export interface TripMetrics {
  // Estimated euros for one pay-as-you-go trip. 0 means genuinely free (bike, walk);
  // null means no leg distance could be established, so no honest estimate exists.
  fareEur: number | null;
  // Kilocalories burned on the human-powered legs.
  kcal: number;
  // Grams of CO2-equivalent this itinerary emits (not avoided; see the spec).
  co2Grams: number;
  // False when at least one leg has no published emission factor, or no distance to
  // apply one to, and so contributes nothing. The total is then a floor, and the UI
  // says so rather than passing an incomplete sum off as the trip's emissions.
  co2Complete: boolean;
}

// --- Geometry -------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_008.8; // IUGG mean Earth radius.

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// OTP fills distance_m for the legs it routes itself (bike, walk) but leaves it null
// for scheduled transit legs, where the shape comes from the timetable. The fare and
// the CO2 both need kilometres, so fall back to the straight line between the leg's
// endpoints. That understates a real tram route, which is stated in the UI footnote
// rather than quietly corrected by a fudge factor.
export function legDistanceM(leg: PlanLeg): number | null {
  if (leg.distance_m != null) return leg.distance_m;
  const { from, to } = leg;
  if (from.lat == null || from.lon == null || to.lat == null || to.lon == null) return null;
  return haversineM(from.lat, from.lon, to.lat, to.lon);
}

// --- Calories -------------------------------------------------------------
//
// 2024 Adult Compendium of Physical Activities (Herrmann et al., J Sport Health Sci
// 2024;13(1):6-12, doi:10.1016/j.jshs.2023.10.010), the activity list PDF at
// https://pacompendium.com/wp-content/uploads/2025/02/1_2024-adult-compendium_1_2024.pdf
// Retrieved 2026-08-15.
//
// Code 01011, "Bicycling, to/from work, self selected pace". Chosen over the speed-band
// entries because a planner does not know the rider's speed, and this row is exactly the
// activity being planned. It happens to equal 01020 (10-11.9 mph, leisure, light effort).
const MET_CYCLING = 6.8;

// Code 17190, "Walking, 2.8 to 3.4 mph, level, moderate pace, firm surface" — 4.5 to
// 5.5 km/h, the pace of a transfer between a platform and a front door.
const MET_WALKING = 3.8;

// The Compendium defines one MET as 1 kcal/kg/hour (https://pacompendium.com/,
// retrieved 2026-08-15), so kcal = MET * body mass in kg * hours.
//
// Average weight of adults aged 20 and over in the Netherlands, reporting year 2025:
// CBS StatLine table 81565NED, "Lengte en gewicht van personen, ondergewicht en
// overgewicht", updated 2026-03-20, retrieved 2026-08-15.
// https://opendata.cbs.nl/statline/#/CBS/nl/dataset/81565NED/table
// Self-reported, so it understates real weight slightly. No Dutch body prescribes a
// default body mass for this kind of calculation; this is a citable stand-in, not a
// standard, and the UI says the figure is for an adult of this weight.
export const DEFAULT_BODY_MASS_KG = 79.1;

// Indexed by OTP leg mode; undefined for every mode that is not human-powered.
const MET_BY_MODE: Record<string, number | undefined> = {
  BICYCLE: MET_CYCLING,
  WALK: MET_WALKING,
};

// --- CO2 ------------------------------------------------------------------
//
// Grams of CO2-equivalent per passenger-kilometre, well-to-wheel (combustion plus the
// upstream energy chain). Dutch national emission factor list for 2026, published by
// Rijkswaterstaat and Stichting Stimular at https://co2emissiefactoren.nl, derived from
// CE Delft (2026), "STREAM Personenvervoer, emissiekentallen modaliteiten 2025".
// All retrieved 2026-08-15.
//
// Tram and metro read zero because GVB and the other Dutch municipal operators buy
// Dutch green electricity, which the list counts as zero. That is a real result for
// Amsterdam, not a missing number, and the UI says so rather than hiding it.
// Indexed by OTP leg mode. undefined means no published factor exists for that mode,
// which is a different thing from zero and is reported as such.
const CO2_G_PER_PASSENGER_KM: Record<string, number | undefined> = {
  // https://co2emissiefactoren.nl/factoren/2026/53/187/personenvervoer-openbaar-vervoer-tram-groene-stroom/
  // changed 2026-01-26; assumes 35% occupancy.
  TRAM: 0,
  // https://co2emissiefactoren.nl/factoren/2026/53/192/personenvervoer-openbaar-vervoer-metro-groene-stroom/
  // changed 2026-01-26; assumes 87% occupancy.
  SUBWAY: 0,
  METRO: 0,
  // https://co2emissiefactoren.nl/factoren/2026/53/182/personenvervoer-openbaar-vervoer-bus-gemiddeld-brandstof-onbekend/
  // changed 2026-01-26; 104 g WTW (71 TTW + 32 WTT), assumes 8.1 passengers. The list
  // publishes no separate city/regional bus factor.
  BUS: 104,
  // https://co2emissiefactoren.nl/factoren/2026/53/196/personenvervoer-openbaar-vervoer-trein-elektrisch/
  // changed 2026-02-05; 19 g WTW, all of it upstream (0 TTW). This was 0 g up to and
  // including the 2025 list: rail's buying co-op Vivens switched from additional Dutch
  // guarantees of origin to standard EU ones, which the list counts as grey power.
  RAIL: 19,
  // co2emissiefactoren.nl omits the ordinary bicycle, but the report underneath it does
  // not: CE Delft, "STREAM Personenvervoer, emissiekentallen modaliteiten 2023" (2024),
  // Tabel 1, row "Fiets - Gewone fiets", carries no emissions in any column, against
  // 3.3 g/rkm for an e-bike and 4.1 for a speed pedelec.
  // https://ce.nl/wp-content/uploads/2024/03/CE_Delft_210506_STREAM_Personenvervoer_2023_Def.pdf
  // Retrieved 2026-08-15.
  BICYCLE: 0,
  WALK: 0,
  // FERRY is deliberately absent. The only water entry in the Dutch list is "Veerboot -
  // Gemiddeld" at 1420 g/rkm, which CE Delft measured on the two diesel car ferries of
  // the Westerschelde Ferry at 24% occupancy, and which the list itself flags as very
  // uncertain. A free, short, bicycle-dense IJ crossing is not that boat, and applying
  // the number would make the ferry the dirtiest leg of any Amsterdam trip. No figure
  // for a city ferry is published anywhere, so the leg is counted as unquantified.
};

// --- Fare -----------------------------------------------------------------
//
// Pay-as-you-go on OVpay or an OV-chipkaart: one boarding fee per journey plus a rate
// per kilometre. Not a quote. GVB bills on its own fare-distance table between the
// check-in and check-out stops, which a client-side kilometre only approximates.
//
// Basistarief, set nationally in the Landelijk Tarievenkader and identical for every
// Dutch bus/tram/metro operator. 2026: EUR 1.16 (2025: EUR 1.12), indexed by the
// Landelijke Tarieven Index of 3.86%. Sources, both retrieved 2026-08-15:
// https://www.gvb.nl/nl/tarieven
// https://www.vervoerregio.nl/artikel/20251119-tarieven-connexxion-ebs-en-gvb-voor-2026-vastgesteld
// Not to be confused with GVB's "instaptarief" of EUR 4, which is the deposit taken
// when you fail to check out. That is a penalty, not part of a completed fare.
const BOARDING_FARE_EUR = 1.16;

// GVB's kilometre rate for 2026 (2025: EUR 0.207). Unlike the basistarief this is set
// per operator by the concession authority, not nationally, and it did not move by the
// same percentage: Vervoerregio Amsterdam raised GVB's kilometre rate by 4.8% for 2026,
// against the 3.86% index applied to the national basistarief. This is Amsterdam's
// rate, which is what the app plans for. Same two sources as above, retrieved
// 2026-08-15.
const GVB_FARE_EUR_PER_KM = 0.217;

// A "journey" under the Landelijk Tarievenkader: check out and check in again on
// another means of public transport within 35 minutes and the basistarief is charged
// once, across operators too. DOVA, "Toelichting op het Landelijk Tarievenkader",
// 20 November 2023, Art. 5 (on lid c of the Uitvoeringsregels), retrieved 2026-08-15:
// https://dova.nu/sites/default/files/Toelichting%20op%20het%20LTK,%2020%20november%202023.pdf
// The same article states it is the express intent of the authorities that a traveller
// pays the basistarief only once per journey whether or not a discount product is
// involved, and that charging it again on transferring to another operator is not
// permitted. Two exceptions it records: the LTK covers bus, tram and metro but not
// train unless the concession authority decides otherwise, and until the discount
// products are fixed their own terms may exclude the transfer rule, which then has to
// be stated to the traveller. Neither bites here: train legs already make the fare
// unquantifiable, and this estimate is for travelling on saldo without a discount.
const FREE_TRANSFER_WINDOW_MS = 35 * 60_000;

// Modes billed at the GVB pay-as-you-go rate.
const GVB_PAID_MODES = new Set(["TRAM", "BUS", "SUBWAY", "METRO"]);

// Modes that cost nothing. The IJ ferries (F1 to F9) carry pedestrians, bicycles and
// mopeds free and have no gates to check in at:
// https://www.gvb.nl/reisproducten/vaarkaarten (retrieved 2026-08-15), which sells
// tickets only for the Noordzeekanaal crossings. An itinerary routed over one of those
// instead would be under-priced here; the app plans inside Amsterdam, where the IJ
// ferries are the ones that appear.
const FREE_MODES = new Set(["WALK", "BICYCLE", "FERRY"]);

// Returns null rather than a number whenever no honest one exists.
//
// The main such case is a train leg. NS does not price by distance: its 2026 fares come
// from a lookup table indexed by tariefeenheden, whose marginal rate tapers from about
// EUR 0.22 to EUR 0.10 per unit as the trip lengthens, over a flat EUR 3.00 minimum up
// to 8 units. The marginal rate is not the price per unit paid: at 9 units the fare
// averages EUR 0.367 per unit, because the minimum dominates the short end. See
// https://www.ns.nl/binaries/_ht_1762337703133/content/assets/ns-nl/tarieven/2026/ns-prijslijst-2026-nl.pdf
// (retrieved 2026-08-15). Tariff units are not kilometres, and we hold neither the full
// table nor a unit count, so a train leg makes the fare unquantifiable rather than
// approximate, and the UI says so instead of showing a number we made up.
//
// Two further things this deliberately does not model, both of which can only make the
// real charge lower than the estimate: the GVB Max daily cap of EUR 10.50 on OVpay
// (https://gvb.nl/max), and hour, day and multi-day tickets. Night buses go the other
// way, at a flat EUR 5.70 outside the distance tariff, but the planner gives us no
// reliable way to tell a night bus from a day bus.
function fareEurFor(it: Itinerary): number | null {
  let total = 0;
  let lastPaidEndMs: number | null = null;

  for (const leg of it.legs) {
    if (FREE_MODES.has(leg.mode)) continue;
    if (!GVB_PAID_MODES.has(leg.mode)) return null; // RAIL, or a mode we do not price.

    const distanceM = legDistanceM(leg);
    if (distanceM == null) return null;

    const newJourney =
      lastPaidEndMs == null || leg.start_time - lastPaidEndMs > FREE_TRANSFER_WINDOW_MS;
    if (newJourney) total += BOARDING_FARE_EUR;
    total += GVB_FARE_EUR_PER_KM * (distanceM / 1000);
    lastPaidEndMs = leg.end_time;
  }

  return Math.round(total * 100) / 100;
}

/**
 * Metrics for one itinerary. Pure: the same itinerary always gives the same numbers,
 * and nothing here talks to the network.
 */
export function tripMetrics(
  it: Itinerary,
  opts: { bodyMassKg?: number } = {},
): TripMetrics {
  const bodyMassKg = opts.bodyMassKg ?? DEFAULT_BODY_MASS_KG;

  let kcal = 0;
  let co2Grams = 0;
  let co2Complete = true;

  for (const leg of it.legs) {
    const met = MET_BY_MODE[leg.mode];
    if (met != null) kcal += met * bodyMassKg * (leg.minutes / 60);

    const factor = CO2_G_PER_PASSENGER_KM[leg.mode];
    if (factor == null) {
      co2Complete = false;
      continue;
    }
    // A zero-emission leg needs no distance: nothing times anything is still nothing.
    if (factor === 0) continue;
    const distanceM = legDistanceM(leg);
    if (distanceM == null) {
      co2Complete = false;
      continue;
    }
    co2Grams += factor * (distanceM / 1000);
  }

  return {
    fareEur: fareEurFor(it),
    kcal: Math.round(kcal),
    co2Grams: Math.round(co2Grams),
    co2Complete,
  };
}
