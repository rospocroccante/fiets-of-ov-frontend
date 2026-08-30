# Trip metrics: fare, calories, CO2, rain

Date: 2026-08-15. Implemented in `src/lib/tripMetrics.ts`, surfaced by
`src/lib/planView.ts`, `src/components/AdviceCard.tsx` and
`src/components/ItineraryDetails.tsx`.

The comparison screen promises five numbers per option: door-to-door time, fare,
calories, CO2 and rain risk. Time comes from the backend. The other four are computed in
the browser from the distance and mode the itinerary already carries, because the
backend sends none of them and this work was not allowed to add a backend dependency.

Everything below is derived. None of it is a price, a measurement or a promise, and the
UI is written so that no reader could mistake it for one. Every figure retrieved
2026-08-15.

## Leg distance

The planner fills `distance_m` for the legs it routes itself, bike and walk, and leaves
it null for scheduled transit legs. The fare and the CO2 both need kilometres, so a null
falls back to the great-circle distance between the leg's endpoints:

```
d = 2 R asin(sqrt(sin²(Δφ/2) + cos φ₁ cos φ₂ sin²(Δλ/2)))    R = 6 371 008.8 m
```

That understates a real tram route. The footnote under the itinerary states as much; no
fudge factor corrects for it.

## Fare

```
fare = Σ over paid legs [ boarding fee if a new journey starts ] + rate × km
```

A new journey starts at the first paid leg, and again whenever more than 35 minutes pass
between the previous paid leg's end and this one's start.

| Constant | Value | Source |
|---|---|---|
| Basistarief (boarding fee) | EUR 1.16 | [gvb.nl/nl/tarieven](https://www.gvb.nl/nl/tarieven); [Vervoerregio Amsterdam, 19-11-2025](https://www.vervoerregio.nl/artikel/20251119-tarieven-connexxion-ebs-en-gvb-voor-2026-vastgesteld) |
| GVB kilometre rate | EUR 0.217/km | same two |
| Free-transfer window | 35 min | [DOVA, "Toelichting op het Landelijk Tarievenkader", 20-11-2023, Art. 5 (PDF)](https://dova.nu/sites/default/files/Toelichting%20op%20het%20LTK,%2020%20november%202023.pdf) |
| IJ ferry | free | [gvb.nl/reisproducten/vaarkaarten](https://www.gvb.nl/reisproducten/vaarkaarten) |

Both tariff figures are the 2026 values, effective 1 January 2026, up from EUR 1.12 and
EUR 0.207. They did not rise by the same percentage. The basistarief is set nationally in
the Landelijk Tarievenkader, is the same for every Dutch bus, tram and metro operator,
and moved by the Landelijke Tarieven Index of 3.86%. The kilometre rate is set per
concession: Vervoerregio Amsterdam put GVB's up by 4.8% for 2026, and EUR 0.217 is
Amsterdam's rate, which is what the app plans for.

A trap worth recording. GVB's own pages call the boarding fee *basistarief*; the word
*instaptarief* on those pages means the EUR 4 deposit taken when you fail to check out,
which is a penalty and never part of a completed fare.

The 35-minute rule comes from the regime itself rather than from an operator's help
pages. Art. 5 of DOVA's explanatory note to the LTK says the basistarief is not charged
again when the traveller checks in on another means of public transport within 35 minutes
of checking out, and that it is the express intent of the authorities that a journey on
saldo costs one basistarief, with or without a discount product; charging it again on
transferring to a second operator is not permitted. The document records two limits on
that. The LTK covers bus, tram and metro and not train, unless the concession authority
decides otherwise, and while the discount products remain unfixed their own terms may
exclude the transfer rule, which then has to be communicated to the traveller explicitly.
Neither reaches this estimate: a train leg already makes the fare unquantifiable, and the
estimate is for travelling on saldo at the undiscounted rate.

### Where the fare returns null instead of a number

A train leg. NS prices from a lookup table indexed by tariefeenheden, over a flat
EUR 3.00 minimum up to 8 units
([2026 price list, PDF](https://www.ns.nl/binaries/_ht_1762337703133/content/assets/ns-nl/tarieven/2026/ns-prijslijst-2026-nl.pdf)).
The figure that tapers from about EUR 0.22 to EUR 0.10 per unit is the marginal rate, the
cost of the next unit, not the price per unit paid: at 9 units the fare works out at
EUR 0.367 a unit, because the minimum swamps the short end of the table. Reading the
marginal rate as an average would underprice every short train leg by a wide margin.
Tariff units are not kilometres, and we hold neither the table nor a unit count, so a
straight-line kilometre run through a linear formula would be a fabrication. The card
shows "No estimate" and the footnote says why.

### Deliberately not modelled

The GVB Max daily cap of EUR 10.50 on OVpay ([gvb.nl/max](https://gvb.nl/max)), and hour,
day and multi-day tickets: both can only make the real charge lower than the estimate.
Night buses go the other way, at a flat EUR 5.70 outside the distance tariff, but the
planner gives no reliable way to tell a night bus from a day bus. The Noordzeekanaal
ferries are ticketed while the IJ ferries are free; an itinerary routed over one of those
would be under-priced.

## Calories

```
kcal = Σ over human-powered legs  MET × body mass (kg) × hours
```

| Constant | Value | Source |
|---|---|---|
| Cycling MET | 6.8, code 01011, "Bicycling, to/from work, self selected pace" | [2024 Adult Compendium of Physical Activities](https://pacompendium.com/wp-content/uploads/2025/02/1_2024-adult-compendium_1_2024.pdf) |
| Walking MET | 3.8, code 17190, "Walking, 2.8 to 3.4 mph, level, moderate pace, firm surface" | same |
| 1 MET | 1 kcal/kg/hour | [pacompendium.com](https://pacompendium.com/) |
| Default body mass | 79.1 kg | [CBS StatLine 81565NED](https://opendata.cbs.nl/statline/#/CBS/nl/dataset/81565NED/table) |

Compendium reference: Herrmann SD et al., "2024 Adult Compendium of Physical Activities:
A third update of the energy costs of human activities", J Sport Health Sci
2024;13(1):6-12, doi:10.1016/j.jshs.2023.10.010.

Code 01011 was chosen over the speed-band rows because a planner does not know the
rider's speed, and that row is exactly the activity being planned. It happens to equal
01020, the 10 to 11.9 mph leisure entry.

The body mass is the CBS average for adults aged 20 and over, reporting year 2025, table
updated 2026-03-20. CBS collects it by self-report, so it understates real weight
slightly, and no Dutch body prescribes a default for calculations of this kind. It is a
citable stand-in, which is why the UI names the weight it assumed instead of presenting
the calorie count as the reader's own.

Transit options get a calorie count too, from the walk to the stop and the walk at the
far end. Zeroing them would have flattered the bike.

## CO2

The screen shows what each option **emits**, in grams of CO2-equivalent, well-to-wheel.
Not what it avoids. Avoided CO2 needs a counterfactual, and the counterfactual for
someone choosing between a bike and a tram is not a car. The difference between the two
options on screen is the avoided amount, and the footnote says so.

```
co2 = Σ over legs  factor(mode) × km
```

Grams of CO2-equivalent per passenger-kilometre, 2026 Dutch national list, published by
Rijkswaterstaat and Stichting Stimular at
[co2emissiefactoren.nl](https://co2emissiefactoren.nl), from CE Delft (2026), "STREAM
Personenvervoer, emissiekentallen modaliteiten 2025":

| Mode | g/pkm | Notes |
|---|---|---|
| [Tram](https://co2emissiefactoren.nl/factoren/2026/53/187/personenvervoer-openbaar-vervoer-tram-groene-stroom/) | 0 | green power, 35% occupancy, changed 2026-01-26 |
| [Metro](https://co2emissiefactoren.nl/factoren/2026/53/192/personenvervoer-openbaar-vervoer-metro-groene-stroom/) | 0 | green power, 87% occupancy, changed 2026-01-26 |
| [Bus](https://co2emissiefactoren.nl/factoren/2026/53/182/personenvervoer-openbaar-vervoer-bus-gemiddeld-brandstof-onbekend/) | 104 | 71 TTW + 32 WTT, 8.1 passengers, changed 2026-01-26 |
| [Train, electric](https://co2emissiefactoren.nl/factoren/2026/53/196/personenvervoer-openbaar-vervoer-trein-elektrisch/) | 19 | all upstream, 0 TTW, changed 2026-02-05 |
| [Bicycle](https://ce.nl/wp-content/uploads/2024/03/CE_Delft_210506_STREAM_Personenvervoer_2023_Def.pdf) | 0 | CE Delft STREAM 2023, Tabel 1, "Fiets, gewone fiets" |
| Walk | 0 | |

Two results here look wrong at a glance and are not.

Tram and metro read zero because GVB and the other municipal operators buy Dutch green
electricity, which the list counts as zero. For most Amsterdam trips the bike and the
tram therefore both emit nothing, and the screen shows 0 g against 0 g. That is the
honest answer for this city in 2026, so the footnote explains it instead of the code
hiding it.

The train is higher than the tram, which was not true a year ago. Up to and including the
2025 list, electric rail was 0 g. Rail's buying co-op Vivens temporarily moved from
additional Dutch guarantees of origin to standard EU ones, and co2emissiefactoren.nl
counts EU guarantees as grey power. Hence 19 g, entirely upstream.

### Ferry: unquantified on purpose

The only water entry in the Dutch list is
[Veerboot, gemiddeld at 1420 g/pkm](https://co2emissiefactoren.nl/factoren/2026/50/212/personenvervoer-veerboot-gemiddeld/),
last revised 2023-01-01 while every other mode moved to the 2026 data. CE Delft measured
it on the two diesel car ferries of the Westerschelde Ferry at 24% occupancy, and the
list itself warns that ferry emissions per passenger-kilometre vary enormously and the
average is very uncertain. A free, short, bicycle-dense IJ crossing is not that boat, and
applying 1420 g/pkm would make the ferry the dirtiest leg of any Amsterdam itinerary,
worse per passenger-kilometre than flying. No Dutch source publishes a figure for a city
ferry.

So a ferry leg contributes nothing and sets `co2Complete: false`. The total is then a
floor, and the footnote says one leg has no published factor. Same treatment for any
future mode with no factor, and for any priced mode whose distance cannot be established.

## Rain

`Option.rain_minutes` already existed in the API type and in the mock, and `toOptionView`
was dropping it, so every option showed the same trip-level banner. It is now carried
through per option, since minutes spent in the rain is exactly what separates a bike from
a metro on a wet afternoon.

One change on top of reinstating it: when `Plan.rain_expected` is null the forecast is
unavailable, and the backend still sends `rain_minutes: 0`. Passing that through would
turn missing data into a promise of a dry ride, so `OptionView.rainMinutes` is null in
that case and the card reads "Rain unknown".

## How this reaches the screen

`OptionView` gained `rainMinutes` and `metrics`. `AdviceCard` renders four short lines
under the minutes, each with a fuller accessible name than its visible text: a screen
reader hears "Estimated fare EUR 2.34" where the card has room only for "≈ €2.34". The
lines stay a narrow stack rather than a row so three cards still fit and scroll on a
360px phone.

`ItineraryDetails` carries the assumptions in a collapsed block under the itinerary, and
only raises the caveats a given itinerary has earned: the no-fare note when a train leg
is present, the zero-CO2 explanation when the total is a true zero and the itinerary has
a tram or metro leg for that explanation to be about, the incomplete note
when a leg has no factor, the straight-line note when a leg had no distance. It
recomputes the metrics from the itinerary rather than receiving them as a prop, because
its caller passes only the itinerary and that component was outside this change.
