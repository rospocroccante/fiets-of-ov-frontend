# Third-party terms, read at source

Date: 2026-08-15. Every quote below was read at the provider's own page on that date, and the
URL is given with it. This note exists to be read against
`docs/superpowers/specs/2026-08-04-business-model-design.md`, whose closing line says
"nessuna licenza da comprare in nessuna fase". That line is wrong on at least two counts.

## Where the product actually stands

Two providers gate the product on a paid arrangement, and one of them gates it today rather
than at the pilot. CARTO restricts its hosted basemap tiles to enterprise customers and
non-profit grantees, in its own words "not available for free public use", so the tiles the app
draws on every screen are outside CARTO's terms right now, including in the offline jury demo
(the tile layer in `MapView.tsx` is unconditional and loads even when `VITE_API_MODE=mock`
switches every other call to a fixture). Open-Meteo's free tier is explicitly non-commercial and
the paid entry plan is around 29 dollars a month. RainViewer says its free API is for personal
and educational use only, while its site-wide terms call the same API "free to use and open to
the public", so that one is genuinely ambiguous and needs an email rather than an
interpretation. Nominatim, Photon and Overpass sell nothing and bar nothing commercial: they
impose volume ceilings and a switchability duty that the app can satisfy cheaply. The good news
sits on the replacement side. PDOK serves a Dutch government basemap and a geocoder that both
answered live queries today at zero cost with no key, and KNMI serves the rain radar as a
standard WMS layer, so the three real problems have Dutch, free, current answers.

## Demo, pilot and licence are three different obligations

A demo for a jury is non-commercial as long as nobody pays for it and it carries no
advertising or subscription. Open-Meteo's free tier covers it, and the RainViewer free terms
plausibly cover it too. A paid pilot (10 to 15k one-off, per the business plan) makes the app a
commercial product from the first invoice: Open-Meteo's free tier stops applying, and
RainViewer's "personal and educational use only" stops applying on any plain reading. A
licensed product adds nothing new in kind, only volume, which is what pushes the Overpass and
Nominatim ceilings from theoretical to real. CARTO is the exception to this phasing, because
its restriction is not about commerce at all: access to the tile service is limited to
customers and grantees regardless of whether money changes hands.

## The matrix

| Provider | Used for | File | Governing term | Verdict |
| --- | --- | --- | --- | --- |
| CARTO basemaps | Raster basemap, voyager and dark_all | `src/components/MapView.tsx` (historical, line 461 at audit time; the basemap now lives in `src/components/Basemap.tsx` and references no CARTO URL) | "access to CARTO's basemap tile services is restricted to CARTO enterprise customers and [Non-Profit GRANTS](https://carto.com/grants) only and is not available for free public use" ([LICENSE.md, CartoDB/basemap-styles](https://github.com/CartoDB/basemap-styles/blob/master/LICENSE.md), read 2026-08-15) | Out of terms. Replaced 2026-08-16 with OpenFreeMap — see the update at the end of this note. |
| Open-Meteo | 12-hour forecast strip; 9x9 wind grid | `src/hooks/useShortForecast.ts:47`, `src/hooks/useWindField.ts:52` | "You may only use the free API services for non-commercial purposes." ([open-meteo.com/en/terms](https://open-meteo.com/en/terms), read 2026-08-15) | Fine for the demo. Blocks the paid pilot. Pay or replace. |
| RainViewer | Rain radar tile frames | `src/hooks/useRainRadar.ts:21` | "This API is available for personal and educational use only." ([rainviewer.com/api.html](https://www.rainviewer.com/api.html), read 2026-08-15) | Ambiguous, contradicted by their own site terms. Ask, or replace. |
| Nominatim | Reverse geocoding of map picks and pin drags | `src/geocode.ts:51` | "Apps must make sure that they can switch the service at our request at any time (in particular, switching should be possible without requiring a software update)." ([operations.osmfoundation.org/policies/nominatim](https://operations.osmfoundation.org/policies/nominatim/), read 2026-08-15) | Allowed. Hardcoded host is a thin breach; 1 req/s per application is the real ceiling. |
| Photon (komoot) | Place autocomplete | `src/api/client.ts:172` | "You can use the API for your project, but please be fair - extensive usage will be throttled." ([photon.komoot.io](https://photon.komoot.io/), read 2026-08-15) | Allowed, no commercial bar. No guarantee of service. |
| Overpass (3 instances) | POI layer and the weekly city prefetch | `src/hooks/usePois.ts:16-21` | "users are expected to send a maximum of about 10000 requests per day and keep their download volume below about 1 GB per day" ([dev.overpass-api.de commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), read 2026-08-15) | Allowed, no commercial bar. Volume is the risk. |
| OpenStreetMap data (via all four above) | Routes, places, addresses | everywhere | ODbL, attribution required | Already credited correctly in `Attribution.tsx`. |
| Material Symbols Rounded | Icon font, self-hosted subset | `index.html` | "We have made these icons available for you to incorporate into your products under the [Apache License Version 2.0]" ([google/material-design-icons README](https://github.com/google/material-design-icons), read 2026-08-15) | Free, commercial use fine, no runtime third party. |
| Maki icons | POI category glyphs, bundled | `src/components/MapView.tsx:22-30` | CC0-1.0 (`node_modules/@mapbox/maki`, `LICENSE.txt`) | Public domain. Nothing to do. |
| react-leaflet 4.2.1 | Map component layer | `package.json` | Hippocratic License 2.1, an "Ethical Source license" with a human-rights condition and a Hague arbitration clause (`node_modules/react-leaflet/LICENSE.md`) | Not a commercial-use bar, but not OSI-approved either. Some public buyers screen for this. |

Runtime npm licences otherwise: leaflet BSD-2-Clause, react and react-dom MIT,
@tanstack/react-query MIT, framer-motion MIT, leaflet-velocity under CSIRO's BSD variant.

## CARTO: the one that bites today

The reviewer's claim held and then some. CARTO's public basemaps page says "For commercial
purposes, you will need an Enterprise license to ensure you have the best basemaps available
for your project" (https://carto.com/basemaps, read 2026-08-15), and the documentation FAQ is
blunter: "CARTO Basemaps are available exclusively with an Enterprise license. There is no
standalone basemap-only pricing tier available." and "Once you have an Enterprise license or a
grant, basemaps are included at no additional cost, and you can use them as much as needed."
(https://docs.carto.com/faqs/carto-basemaps, read 2026-08-15). The style repository's licence
file is the sentence that matters most, because it removes the commercial-versus-free framing
entirely: the tile service is "restricted to CARTO enterprise customers and Non-Profit GRANTS
only and is not available for free public use". No price is published anywhere; CARTO Enterprise
is a sales conversation, and a basemap-only tier does not exist.

On the PDF the reviewer could not open. `https://carto.com/legal/bmap/` is a 301 to
`https://drive.google.com/file/d/15W7lHI9LcRKsUCuWgOCWkVwB54HHV5kb/view`. Direct download
returns "Sorry, the owner hasn't given you permission to download this file. Only the owner and
editors can download this file." Page 1 of 7 is still recoverable, because Drive renders a
thumbnail of the first page for view-only files, and it reads as a customer contract rather
than a public licence: "These CARTO Basemaps Terms of Service and any future modifications
thereof (collectively, the "Basemap Terms"), Customer's Order Form or grant, as applicable
[...] constitute a single, binding agreement", with "Grant Basemap Services" defined as
"Basemap Services that CARTO makes available to Customer on a grant basis pursuant to a grant
application". Pages 2 to 7 are not readable without a Google login, and I could not get them by
any route. That is a real limit on this note: the fee, termination and audit clauses are
unread. It does not change the conclusion, because the three public statements agree with each
other and with page 1.

Replacement: PDOK BRT Achtergrondkaart, the Kadaster's own basemap.
`https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/WMTSCapabilities.xml` declares
`<ows:Fees>none</ows:Fees>` and `<ows:AccessConstraints>none</ows:AccessConstraints>`, offers
five styles (standaard, grijs, pastel, water, labels) and publishes an EPSG:3857 tile matrix, so
a plain Leaflet `TileLayer` consumes it. A live tile at z14 over Amsterdam returned 45 kB of PNG
today. PDOK states "De PDOK diensten zijn gebaseerd op open data en daarom voor iedereen vrij
beschikbaar" (https://www.pdok.nl/over-pdok, read 2026-08-15) and, for this product
specifically, "De BRT-A is de achtergrondkaart voor heel Nederland en is gratis te gebruiken
via PDOK" plus "Overheden zijn verplicht bij kaartachtergronden de BRT te gebruiken". That last
sentence is a sales argument as much as a licence fact: Dutch public bodies are obliged to use
BRT for map backgrounds, so a municipal buyer will prefer this basemap to CARTO's.

Engineering cost: change one URL template, swap the CARTO credit for a Kadaster credit, and
decide what dark mode does. BRT-A has no dark style, so either keep the existing CSS filter
trick on the "grijs" style or accept a light map at night. Half a day to a day. The one
functional loss is coverage: BRT-A stops at the Dutch border, which is irrelevant for an
Amsterdam product and would matter if the app ever showed anything abroad. If global coverage
is wanted, OpenFreeMap is the free alternative ("Using our public instance is completely free:
there are no limits on the number of map views or requests", https://openfreemap.org, read
2026-08-15, commercial use answered "Yes"), and its tile endpoint served a vector tile today.
It ships vector tiles only, so it needs MapLibre GL beside Leaflet, which is one to two days.

Blocks: everything. This is the only item that is already out of terms in the current free
demo, so it should be fixed before the next public showing rather than before the first invoice.

## RainViewer: ambiguous, and the ambiguity is theirs

The API page states "This API is available for personal and educational use only." and, under
Terms of Use, "The API is free for personal or educational use." The FAQ on the same page
softens it in one direction and hardens it in another: "Yes — the public Weather Maps API is
free for personal, educational, and small-scale community use. There's no fee or paid tier
currently, but the free service comes without SLA guarantees and is not intended for
high-volume commercial applications", and "For high-volume traffic, commercial integration, or
any use case where you depend on guaranteed availability, get in touch — bespoke commercial
terms are arranged case-by-case." Meanwhile the site-wide terms at
https://www.rainviewer.com/terms.html (read 2026-08-15) say, in section VI, "Our API is free to
use and open to the public." Those two documents do not agree. There is no published price and
no paid tier, so "buy a licence" is not currently an available action: the only route is to ask
them for bespoke terms. Attribution is required either way, and the app already does it
correctly ("We kindly ask you to mention the RainViewer API as a source of the data on your
website with a link").

Replacement: KNMI, which is better data for the Netherlands anyway. The radar is published as
open data under Creative Commons Attribution 4.0 (dataset `radar_reflectivity_composites`,
5-minute reflectivity composites, HDF5, updating continuously; latest file today was
`RAD_NL25_PCP_NA_202608151000.h5`). Crucially it is also served as WMS, so no HDF5 decoding is
needed: `https://geoservices.knmi.nl/wms?dataset=RADAR` advertises layer `RAD_NL25_PCP_CM`
("Precipitation Radar NL") with a time dimension covering `2024-12-05T13:35:00Z/
2026-08-15T10:05:00Z/PT5M` and ready-made styles including `precip-blue-transparent`. A GetMap
request without any key returned a 512x512 PNG today. Leaflet consumes that with
`L.tileLayer.wms` and a `time` parameter per animation frame.

The catch is quota, and it is the reason this is not a one-hour job. KNMI's WMS API documents
"Anonymous: 1 request per second (per IP), 1000 requests per hour (shared)" and, with an API
key, "20 requests per second, 1000 requests per hour"
(https://developer.dataplatform.knmi.nl/wms, read 2026-08-15). The hourly quota does not grow
with the key. An eight-frame radar loop costs at least eight GetMap calls per viewer, so a
direct browser-to-KNMI layer supports roughly a hundred viewers an hour before the quota is
gone. Production therefore needs a small caching proxy that pulls each 5-minute frame once and
serves it to everyone, which is the same server the plan already assumes for OTP. Budget two to
four days: WMS time layer in the client, proxy with a frame index endpoint shaped like the one
`useRainRadar` already expects, cache expiry, and the KNMI credit.

Blocks: the paid pilot, on the plain reading of "personal and educational use only". The jury
demo is defensible under the same sentence plus the FAQ's "small-scale community use". Send
RainViewer an email before the pilot, and if the answer is a price, switch to KNMI instead.

## Open-Meteo: cheapest problem in the list

The claim held exactly. "You may only use the free API services for non-commercial purposes",
with the free limits stated as "Less than 10'000 API calls per day, 5'000 per hour and 600 per
minute", and the commercial examples spelled out: "Operating websites or apps that have
subscriptions or display advertisements" and "Integrating our service into commercial products
or promotional activities" (https://open-meteo.com/en/terms, read 2026-08-15). An app licensed
to a municipality is a commercial product by that definition, whether or not the end user pays.
The pricing page confirms what a subscription buys: "A subscription grants a commercial use
licence and an API key for the dedicated customer endpoint at customer-api.open-meteo.com. The
API syntax is identical to the free tier — only the domain and key parameter differ." and "Use
the free tier for evaluation and prototyping." (https://open-meteo.com/en/pricing, read
2026-08-15). The page renders its prices client-side and I could not read them from the HTML;
Open-Meteo's own announcement post states "The "Standard Plan" is priced at $29 per month and
provides 1 million API calls per month" and 99 dollars for the Professional plan
(https://openmeteo.substack.com/p/api-subscriptions-for-commercial, read 2026-08-15), so treat
29 dollars as indicative and confirm at checkout.

Note the wind field asks for 81 coordinates in a single request, refreshed every 15 minutes per
session. Open-Meteo does not publish how multi-location calls are weighted against the quota,
which is worth knowing before assuming 1M calls a month is generous.

Engineering cost of paying: about an hour. Swap the host to `customer-api.open-meteo.com`, add
`&apikey=`, keep the CC BY 4.0 credit that `Attribution.tsx` already renders ("You must include
a link next to any location Open-Meteo data are displayed",
https://open-meteo.com/en/licence). Engineering cost of not paying: KNMI's EDR API carries
observations and daily gridded fields, not an hourly forecast, so the free Dutch route means
reading Harmonie GRIB files from the KNMI file API and interpolating them yourself. That is
several days plus a permanent server job, to save 350 dollars a year. Pay.

Blocks: the paid pilot, not the demo. Note that 29 dollars a month is a fixed cost, which the
business plan's "zero costi fissi" rule forbids until a contract is signed. It fits inside the
pilot price, so the sequencing still works.

## Nominatim: the reviewer over-read one clause and under-read another

The vibe-coding clause does not apply to this app. Verbatim: "The public Nominatim API must not
be built into, offered through, suggested by, or automatically generated by no-code, low-code,
or vibe-coding platforms as a generic geocoding, address lookup, place search, or map search
service. Use of the public API is only permitted where the application developer has made a
deliberate, informed decision to use it and is directly responsible for complying with this
policy." The prohibition is aimed at platforms that hand out geocoding as a generic service.
Fiets of OV is a hand-built application whose developer chose Nominatim deliberately, which is
precisely the permitted case named in the second sentence. This note is part of the record of
that informed decision.

The switching clause does apply: "Apps must make sure that they can switch the service at our
request at any time (in particular, switching should be possible without requiring a software
update). If at all possible, set up a proxy and also enable caching of requests." Whether a
hardcoded host in a static SPA breaches this is genuinely arguable. There is no app store and
no user-installed binary, so a redeploy reaches every user on their next load with no action on
their part, which satisfies the intent. Read literally, changing the host still means editing
source and rebuilding, which is a software update. The argument is not worth having, because
the fix costs half an hour: read the host from a build-time env var, or better, fetch it from a
tiny runtime config JSON so the switch is a file edit on the CDN.

The clause that actually threatens the licensed product is the ceiling: "No heavy uses (an
absolute maximum of 1 request per second)" and "Note that the usage limits above apply per
website/application: the sum of traffic by all your users should not exceed the limits." One
request per second across all users, for an app whose reverse geocode fires on every map pick
and every pin drag. The policy also warns directly about this business model: "Commercial
applications should keep that in mind when relying on this API for serving paying customers."
Autocomplete is separately forbidden ("Auto-complete search [...] you must not implement such a
service on the client side using the API"), which the app respects, because typing goes to
Photon rather than Nominatim. The identification requirement ("Provide a valid HTTP Referer or
User-Agent identifying the application") is met by the browser's Referer from the deployed
origin.

Replacement for both Nominatim and Photon: PDOK Locatieserver, which I queried live today.
`https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=Vondelpark` returned BAG-backed
results with `weergavenaam: "Vondelpark, Amsterdam"`, and
`https://api.pdok.nl/bzk/locatieserver/search/v3_1/reverse?lat=52.3791&lon=4.9003` returned
`"Stationsplein 39G, 1012AB Amsterdam"` with a distance of 1.76 m. No key, no registration, and
a dedicated `suggest` endpoint that the PDOK documentation describes as the one to use for
autocomplete. It covers the Netherlands only, which is the whole market. Engineering cost: half
a day for both call sites, since the response shapes are simple and `geocode.ts` and
`photonSearch` already normalise into app types. Doing this also removes the switchability
question entirely and replaces an unguaranteed hobby endpoint (Photon: "We do not guarantee for
the availability") with a Kadaster service a gemeente already trusts.

Blocks: nothing, at any phase. Do it anyway, because it is cheap, it removes two foreign
dependencies, and PDOK is a better story in front of a Dutch buyer.

## Overpass: no licence problem, a volume problem

Nobody charges for Overpass and nobody bars commercial use. Private.coffee, which now runs the
instance the app still calls `overpass.kumi.systems`, says so explicitly: "Use our endpoints in
any project requiring access to OpenStreetMap data, including commercial use. No registration
needed" (https://overpass.kumi.systems/, read 2026-08-15), and the OSM wiki adds "Previously
known as overpass.kumi.systems. Feel free to use our service in any project, there is no rate
limit in place. Please notify us in advance if you intend to use our service in a large scale
project."

The main instance's own manual is where the problem is. Under "Magnitudes" it lists examples of
problematic behaviour, and one of them is this app: "Setting up an app for more than just OSM
mappers and relying on the public instances as backend", answered with "only running your own
instance sustainably serves your mission". The guideline is "a maximum of about 10000 requests
per day" and under "1 GB per day" per user of the service. `usePois.ts` sweeps the entire
Amsterdam core (52.32-52.43, 4.80-4.99) for up to 8000 elements once a week per browser, plus
per-cell fills while panning. One user is nothing. Ten thousand users make the weekly sweep a
distributed bulk download of the same city, which is exactly the pattern the manual asks people
not to build.

Two operational facts found while testing, worth a separate ticket. The FR mirror
`overpass.openstreetmap.fr` serves "This service is only available to white-listed usages" on
its homepage, although its `/api/interpreter` did answer an anonymous query today, so its
status is unclear and it should not be relied on. The Private.coffee instance answered in 7.9
seconds, which is longer than the 6-second per-attempt timeout in `fetchPois`, so that fallback
effectively never completes for single-cell fetches.

Replacement: build the POI set at build time, as the business plan already guessed. Download the
Netherlands extract from Geofabrik (ODbL, same licence and same attribution the app already
carries), filter the same amenity and tourism tags with `osmium`, cut it into the same grid
cells `poiStore` already uses, and ship the JSON with the bundle or as static files on the CDN.
The runtime code shrinks rather than grows: `fetchPois` and its three-endpoint retry chain
disappear, and the layer becomes instant and offline-capable. One to two days, including a
refresh script to re-run monthly. This is a performance and reliability win before it is a
compliance one.

Blocks: nothing legally, at any phase. Do it before the first licence renewal, or before
whichever comes first of ten thousand users and a maintainer's email.

## What is genuinely free and unencumbered

OpenStreetMap data under ODbL, with the attribution the app already renders in the map corner
and under the results column. Material Symbols under Apache 2.0, self-hosted, so no request
leaves the origin. Maki icons under CC0. Leaflet under BSD-2-Clause, React, react-query and
framer-motion under MIT, leaflet-velocity under CSIRO's BSD variant. PDOK's services, both the
BRT basemap ("Fees: none, AccessConstraints: none") and the Locatieserver, free with no key and
no registration. KNMI open data under CC BY 4.0, subject to the WMS quotas above. OpenFreeMap,
free with commercial use explicitly allowed, if global coverage is ever needed. Overpass and
Photon, free and commercially unrestricted, with no availability guarantee from anyone.

Two loose ends that are not licence problems but will surface in a public-sector procurement
review. react-leaflet 4.2.1 ships under the Hippocratic License 2.1, which is not OSI-approved
and carries a human-rights compliance condition plus a Hague arbitration clause; nothing in it
restricts this use, and some buyers' legal checklists reject non-OSI licences on sight, so know
the answer before the question. And the CARTO style licence asks for an OpenMapTiles credit
alongside the CARTO one, which `Attribution.tsx` does not render; that becomes moot the moment
the basemap moves to PDOK.

## Correction list for the business model document

Three sentences in `2026-08-04-business-model-design.md` need revising. "Meteo: KNMI open data /
Open-Meteo / Buienradar — €0" is wrong twice: Open-Meteo is not free for commercial use, and
Buienradar states "Het gebruik van onderstaande weerdata is alleen toegestaan voor
niet-commerciële doeleinden, bronvermelding is daarbij verplicht" and "Het gebruik voor mobiele
toepassingen of commerciële doeleinden vereist toestemming van Buienradar"
(https://www.buienradar.nl/overbuienradar/gratis-weerdata, read 2026-08-15). KNMI alone is the
free option. "Geocoding: PDOK Locatieserver — €0" is correct and verified. And "nessuna licenza
da comprare in nessuna fase" should become: no licence to buy for maps or geocoding once CARTO
is replaced by PDOK, roughly 350 dollars a year for weather unless the KNMI feeds are built out,
and an open question at RainViewer that must be closed before the first paid pilot.

## Update 2026-08-16: CARTO replaced

The basemap unit shipped. `MapView.tsx` no longer references CARTO anywhere; the map is
OpenFreeMap vector tiles (MapLibre GL hosted inside Leaflet via
`@maplibre/maplibre-gl-leaflet`), style `bright` by day and `dark` at night, tiles from
tiles.openfreemap.org — free for commercial and non-commercial use, no registration and no
API key (https://openfreemap.org, read 2026-08-16). Credits for OpenFreeMap, OpenMapTiles
and OpenStreetMap live in the About block and in the privacy notice, in both languages; the
map itself stays credit-free by design. Without WebGL the map falls back to PDOK BRT-A
raster (`standaard` by day, `grijs` inverted at night), and that path carries its own
credit: the About block names PDOK, the Kadaster and the BRT-Achtergrondkaart as the
no-WebGL fallback in both languages, and the privacy notice names `service.pdok.nl` as
the host the browser contacts when it is the one serving the tiles. A CDP network capture
across boot, trip planning, theme toggle and radar playback recorded zero requests to
basemaps.cartocdn.com; the browser suite pins the GL basemap, per-theme darkness, the
radar-above-basemap stacking, the PDOK fallback and the zoom ceiling with 74 assertions in
`browser-tests/specs/basemap.checks.mjs`.
The CARTO row above is retained as the audit finding that forced the change.
