import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "en" | "nl";

// Every user-facing string in both languages. Parameterized strings use {name}
// placeholders substituted by translate/t. The Dutch is vetted verbatim; the few
// strings without a vetted Dutch line stay English in both languages rather than
// getting an improvised translation.
const STRINGS = {
  headlineTop: { en: "Bike or transit?", nl: "Fiets of OV?" },
  headlineBottom: { en: "Let the weather decide.", nl: "Laat het weer beslissen." },
  subtitle: {
    en: "Plan any trip across Amsterdam and get a rain-aware answer in one tap.",
    nl: "Plan een rit door Amsterdam en krijg met een tik een regenbewust antwoord.",
  },
  popularTrips: { en: "Popular trips", nl: "Populaire ritten" },
  toX: { en: "to {x}", nl: "naar {x}" },
  from: { en: "From", nl: "Van" },
  to: { en: "To", nl: "Naar" },
  now: { en: "Now", nl: "Nu" },
  search: { en: "Search", nl: "Zoeken" },
  swapStartEnd: { en: "Swap start and end", nl: "Wissel start en einde om" },
  // The same control's visible text where it has a label of its own (the phone search
  // screen). Deliberately a prefix of `swapStartEnd`, which stays the accessible name:
  // WCAG's label-in-name rule wants the spoken name to contain the written one.
  swap: { en: "Swap", nl: "Wissel om" },
  // The map stage's back arrow. The wordmark next to it goes home and clears the trip;
  // this only walks back to the screen the user came from, trip intact.
  backToHome: { en: "Back to home", nl: "Terug naar het startscherm" },
  // Phone search. Below `sm` the pill has no room for two fields, so it becomes one
  // full-width button that opens a search screen of its own (see MobileSearch.tsx).
  // `whereTo` is what that button says before a trip has been entered; once either
  // endpoint is set it shows the trip itself.
  whereTo: { en: "Where to?", nl: "Waarheen?" },
  planTrip: { en: "Plan your trip", nl: "Plan je rit" },
  closeSearch: { en: "Close search", nl: "Sluit het zoekscherm" },
  clearX: { en: "Clear {x}", nl: "Wis {x}" },
  needBothEndpoints: {
    en: "Add a start and a destination to search.",
    nl: "Vul een vertrekpunt en een bestemming in om te zoeken.",
  },
  bike: { en: "Bike", nl: "Fiets" },
  transit: { en: "Transit", nl: "OV" },
  bikeAndRide: { en: "Bike + OV", nl: "Fiets + OV" },
  routesInArea: { en: "{n} routes in area", nl: "{n} routes in beeld" },
  setOnMap: { en: "Set on map", nl: "Kies op de kaart" },
  start: { en: "Start", nl: "Start" },
  end: { en: "End", nl: "Einde" },
  radar: { en: "Radar", nl: "Radar" },
  hideMap: { en: "Hide map", nl: "Verberg kaart" },
  showMap: { en: "Show map", nl: "Toon kaart" },
  // The phone filter bar's trailing control, which holds the map's own tools (set an
  // endpoint by tapping, the rain radar, hide the map). Two strings for one button on
  // purpose: `mapTools` is what it says, `mapToolsMenu` is what a screen reader and a
  // voice-control user get, and the written one is a prefix of the spoken one so
  // "tap Map" still works (same rule as swap / swapStartEnd above).
  mapTools: { en: "Map", nl: "Kaart" },
  mapToolsMenu: { en: "Map options", nl: "Kaartopties" },
  closeMapTools: { en: "Close map options", nl: "Sluit kaartopties" },
  zoomInForPlaces: { en: "Zoom in to see bars and places", nl: "Zoom in voor cafés en plekken" },
  placesUnavailable: { en: "Places unavailable right now", nl: "Plekken zijn nu niet beschikbaar" },
  placesPartial: { en: "Some places are missing here", nl: "Hier ontbreken enkele plekken" },
  clickMapSetStart: {
    en: "Click the map to set the start",
    nl: "Klik op de kaart om het startpunt te kiezen",
  },
  clickMapSetEnd: {
    en: "Click the map to set the end",
    nl: "Klik op de kaart om het eindpunt te kiezen",
  },
  directionsFromHere: { en: "Directions from here", nl: "Route vanaf hier" },
  directionsToHere: { en: "Directions to here", nl: "Route hierheen" },
  whatsHere: { en: "What's here?", nl: "Wat is hier?" },
  rain: { en: "Rain", nl: "Regen" },
  wind: { en: "Wind", nl: "Wind" },
  rainRadarUnavailable: { en: "Rain radar unavailable", nl: "Regenradar niet beschikbaar" },
  windDataUnavailable: { en: "Wind data unavailable", nl: "Windgegevens niet beschikbaar" },
  legendLight: { en: "light", nl: "licht" },
  legendHeavy: { en: "heavy", nl: "zwaar" },
  farFromRoute: {
    en: "You are far from this route. Navigation resumes when you get closer.",
    nl: "Je bent ver van deze route. De navigatie gaat verder zodra je dichterbij komt.",
  },
  idlePrompt: {
    en: "Enter origin and destination to see the bike-or-transit advice.",
    nl: "Vul vertrek en bestemming in voor het fiets-of-OV-advies.",
  },
  noOptionsMatch: {
    en: "No options match the current filters.",
    nl: "Geen opties passen bij de huidige filters.",
  },
  dry: { en: "Dry", nl: "Droog" },
  rainExpected: { en: "Rain expected", nl: "Regen op komst" },
  forecastUnavailable: { en: "Forecast unavailable", nl: "Verwachting niet beschikbaar" },
  upToMmH: { en: "up to {x} mm/h", nl: "tot {x} mm/u" },
  best: { en: "Best", nl: "Beste" },
  // Names the list of options for a screen reader, which meets it as a bare list of
  // three rows with no heading above it.
  travelOptions: { en: "Travel options", nl: "Reisopties" },
  byBike: { en: "By bike", nl: "Met de fiets" },
  publicTransport: { en: "Public transport", nl: "Openbaar vervoer" },
  bikePlusTransit: { en: "Bike + transit", nl: "Fiets + OV" },
  stepByStep: { en: "Step by step", nl: "Stap voor stap" },
  walk: { en: "Walk", nl: "Lopen" },
  towardsX: { en: "towards {x}", nl: "richting {x}" },
  destination: { en: "Destination", nl: "Bestemming" },
  leaveNow: { en: "Leave now", nl: "Vertrek nu" },
  leaveAtT: { en: "Leave at {t}", nl: "Vertrek om {t}" },
  startNavigation: { en: "Start navigation", nl: "Start navigatie" },
  exitNavigation: { en: "Exit navigation", nl: "Stop navigatie" },
  youHaveArrived: { en: "You have arrived", nl: "Je bent er" },
  menu: { en: "Menu", nl: "Menu" },
  darkMode: { en: "Dark mode", nl: "Donkere modus" },
  lightMode: { en: "Light mode", nl: "Lichte modus" },
  clearRecentSearches: { en: "Clear recent searches", nl: "Wis recente zoekopdrachten" },
  clearSavedPlaces: { en: "Clear saved places", nl: "Wis opgeslagen plekken" },
  aboutText: {
    en: "Rain-aware bike vs transit advice for Amsterdam. Routing by OpenTripPlanner. Map data © OpenStreetMap contributors, tiles by OpenFreeMap © OpenMapTiles. If WebGL is unavailable the map falls back to raster tiles from PDOK (service.pdok.nl, the Kadaster's BRT-Achtergrondkaart). Place search via Photon (photon.komoot.io), addresses for map picks via Nominatim, places via Overpass, rain radar by RainViewer, weather by Open-Meteo under CC BY 4.0.",
    nl: "Regenbewust fiets-of-OV-advies voor Amsterdam. Routes door OpenTripPlanner. Kaartdata © OpenStreetMap-bijdragers, tiles van OpenFreeMap © OpenMapTiles. Als WebGL niet beschikbaar is, valt de kaart terug op rastertegels van PDOK (service.pdok.nl, BRT-Achtergrondkaart van het Kadaster). Zoeken naar plekken via Photon (photon.komoot.io), adressen bij het prikken op de kaart via Nominatim, plekken via Overpass, regenradar door RainViewer, weer door Open-Meteo onder CC BY 4.0.",
  },
  // Attribution for the results column (see components/Attribution).
  dataSources: { en: "Data sources", nl: "Gegevensbronnen" },
  // {x} is the linked provider name. Splitting the sentence this way lets each
  // language put the link where its own word order needs it.
  sourceWeather: { en: "Weather data by {x}", nl: "Weergegevens van {x}" },
  sourceRoutes: {
    en: "routes and places from {x} data",
    nl: "routes en plekken uit {x}-gegevens",
  },
  // The menu item names the language you would switch TO, in that language.
  otherLanguage: { en: "Nederlands", nl: "English" },
  recent: { en: "Recent", nl: "Recent" },
  clear: { en: "Clear", nl: "Wissen" },
  directionsToX: { en: "Directions to {x}", nl: "Route naar {x}" },
  minutesAgo: { en: "{n}m ago", nl: "{n} min geleden" },
  hoursAgo: { en: "{n}h ago", nl: "{n} u geleden" },
  daysAgo: { en: "{n}d ago", nl: "{n} d geleden" },
  fromHere: { en: "From here", nl: "Vanaf hier" },
  toHere: { en: "To here", nl: "Hierheen" },
  savePlace: { en: "Save this place", nl: "Bewaar deze plek" },
  removeSavedPlace: { en: "Remove from saved places", nl: "Verwijder uit opgeslagen plekken" },
  closePlaceInfo: { en: "Close place info", nl: "Sluit plekinfo" },
  closeMenu: { en: "Close menu", nl: "Sluit menu" },
  useMyLocation: { en: "Use my location", nl: "Gebruik mijn locatie" },
  currentLocation: { en: "Current location", nl: "Huidige locatie" },
  switchToDark: { en: "Switch to dark mode", nl: "Schakel naar donkere modus" },
  switchToLight: { en: "Switch to light mode", nl: "Schakel naar lichte modus" },
  switchLanguage: { en: "Switch language", nl: "Wissel van taal" },
  kmByBike: { en: "{d} km by bike", nl: "{d} km fietsen" },
  plusFerry: { en: "+ ferry", nl: "+ pont" },
  bikeMinutes: { en: "Bike {n} min", nl: "Fiets {n} min" },
  yourStop: { en: "your stop", nl: "je halte" },
  weatherClear: { en: "Clear", nl: "Helder" },
  weatherPartlyCloudy: { en: "Partly cloudy", nl: "Half bewolkt" },
  weatherOvercast: { en: "Overcast", nl: "Bewolkt" },
  weatherFog: { en: "Fog", nl: "Mist" },
  weatherRain: { en: "Rain", nl: "Regen" },
  weatherSnow: { en: "Snow", nl: "Sneeuw" },
  weatherThunderstorm: { en: "Thunderstorm", nl: "Onweer" },
  weatherClouds: { en: "Clouds", nl: "Bewolking" },
  bikeRoute: { en: "Bike route", nl: "Fietsroute" },
  // Per-option comparison metrics. The fare is always an estimate and is written as
  // one: "~" in the value, "Estimated fare" in the accessible name. Never a price.
  fareApprox: { en: "≈ {x}", nl: "≈ {x}" },
  fareFree: { en: "Free", nl: "Gratis" },
  fareNoEstimate: { en: "No estimate", nl: "Geen schatting" },
  a11yFareApprox: { en: "Estimated fare {x}", nl: "Geschatte prijs {x}" },
  a11yFareFree: { en: "No fare to pay for this trip", nl: "Geen ritprijs te betalen voor deze rit" },
  a11yFareNoEstimate: {
    en: "The fare for this trip cannot be estimated",
    nl: "De prijs van deze rit kan niet worden geschat",
  },
  kcalValue: { en: "{n} kcal", nl: "{n} kcal" },
  a11yKcal: { en: "About {n} kilocalories burned", nl: "Ongeveer {n} kilocalorieën verbrand" },
  co2Value: { en: "{n} g CO2", nl: "{n} g CO2" },
  a11yCo2: { en: "About {n} grams of CO2 emitted", nl: "Ongeveer {n} gram CO2 uitgestoten" },
  // The same total when a leg has no published emission factor and so contributes
  // nothing: the sum is a floor, and the row says so rather than printing it in the
  // same words as a complete one. The full reason is in the estimates note.
  co2AtLeast: { en: "≥ {n} g CO2", nl: "≥ {n} g CO2" },
  a11yCo2AtLeast: {
    en: "At least {n} grams of CO2 emitted; one leg has no published emission factor",
    nl: "Minstens {n} gram CO2 uitgestoten; voor één traject is geen emissiefactor gepubliceerd",
  },
  rainMinutesValue: { en: "{n} min in rain", nl: "{n} min in de regen" },
  noRain: { en: "No rain", nl: "Geen regen" },
  rainUnknown: { en: "Rain unknown", nl: "Regen onbekend" },
  a11yRainMinutes: {
    en: "About {n} minutes of this trip are exposed to rain",
    nl: "Ongeveer {n} minuten van deze rit zijn blootgesteld aan regen",
  },
  a11yNoRain: { en: "No rain expected during this trip", nl: "Geen regen verwacht tijdens deze rit" },
  a11yRainUnknown: {
    en: "The rain forecast for this trip is unavailable",
    nl: "De regenverwachting voor deze rit is niet beschikbaar",
  },
  // The footnote under the selected itinerary. Every claim the cards make in three
  // words gets its assumptions stated in full here, once.
  estimatesTitle: { en: "How these figures are worked out", nl: "Hoe deze cijfers zijn berekend" },
  estimatesFare: {
    en: "Fare: an estimate for one pay-as-you-go trip on OVpay or an OV-chipkaart, boarding fee plus the distance rate, counting a transfer made within 35 minutes as the same journey. It takes no account of season tickets, day tickets, discounts or the GVB Max daily cap of €10.50, so what you are charged may differ, and on a long day of travelling it can be lower.",
    nl: "Prijs: een schatting voor één losse rit met OVpay of de OV-chipkaart, instaptarief plus het kilometertarief, waarbij een overstap binnen 35 minuten als dezelfde reis telt. Abonnementen, dagkaarten, kortingen en het GVB Max-dagmaximum van €10,50 zijn niet meegerekend, dus het bedrag dat je betaalt kan afwijken en op een lange reisdag lager uitvallen.",
  },
  estimatesKcal: {
    en: "Calories: time spent cycling and walking, at published MET values, for an adult of {kg} kg. Your own figure depends on your weight, pace and the wind.",
    nl: "Calorieën: de tijd die je fietst en loopt, met gepubliceerde MET-waarden, voor een volwassene van {kg} kg. Jouw eigen verbruik hangt af van gewicht, tempo en wind.",
  },
  estimatesCo2: {
    en: "CO2: what this trip emits, not what it saves, using Dutch emission factors per passenger-kilometre. Cycling and walking emit nothing, so the difference between the options is the CO2 you avoid by riding.",
    nl: "CO2: wat deze rit uitstoot, niet wat je bespaart, op basis van Nederlandse emissiefactoren per reizigerskilometer. Fietsen en lopen stoten niets uit, dus het verschil tussen de opties is de CO2 die je met de fiets vermijdt.",
  },
  estimatesCo2Zero: {
    en: "Amsterdam's trams and metros run on Dutch green electricity, which the 2026 national factors count as zero. Buses and trains do not: those legs carry emissions.",
    nl: "De Amsterdamse trams en metro's rijden op Nederlandse groene stroom, die in de landelijke factoren van 2026 als nul telt. Bussen en treinen niet: die trajecten stoten wel uit.",
  },
  estimatesCo2Incomplete: {
    en: "One leg of this trip has no published emission factor, so it is left out and the CO2 figure is a floor. No Dutch source publishes a figure for a city ferry.",
    nl: "Voor een traject van deze rit is geen emissiefactor gepubliceerd; dat traject telt niet mee, dus het CO2-cijfer is een ondergrens. Geen Nederlandse bron publiceert een cijfer voor een stadspont.",
  },
  estimatesNoFare: {
    en: "No fare is estimated for this trip: it includes a train leg, and NS prices come from a tariff table rather than a rate per kilometre.",
    nl: "Voor deze rit wordt geen prijs geschat: er zit een treintraject in, en NS rekent met een tarieventabel in plaats van een kilometertarief.",
  },
  estimatesStraightLine: {
    en: "Where the planner does not give a distance for a leg, the straight line between its stops is used instead, which understates both the fare and the CO2.",
    nl: "Als de planner geen afstand voor een traject meegeeft, wordt de rechte lijn tussen de haltes gebruikt; dat valt zowel voor de prijs als voor de CO2 aan de lage kant uit.",
  },
  // Spoken by the polite live region, not drawn: a plan finishing (or failing) only
  // repaints a pane that may be scrolled out of view on a phone.
  planReadyAnnounce: {
    en: "Advice ready: {n} options.",
    nl: "Advies klaar: {n} opties.",
  },
  planErrorAnnounce: {
    en: "This trip could not be planned.",
    nl: "Deze rit kon niet gepland worden.",
  },
  // The header and the morphing search pill both sit ahead of the content in tab
  // order, so the first Tab on the page offers a way past them.
  skipToContent: { en: "Skip to main content", nl: "Ga naar de hoofdinhoud" },
  // Privacy notice. Everything it claims is checked against what the code does: the
  // reverse geocoder in geocode.ts, the tile and overlay hosts in MapView and the
  // weather hooks, and the localStorage keys behind useRecentTrips/useSavedPlaces.
  // The lines marked PLACEHOLDER are the ones only the owner of the service can
  // answer; they are meant to be found and replaced, not shipped.
  privacy: { en: "Privacy", nl: "Privacy" },
  closePrivacy: { en: "Close the privacy notice", nl: "Sluit de privacyverklaring" },
  privacyIntro: {
    en: "There is no account, no login and no cookie. The app runs no analytics, sets no tracker and builds no profile of you.",
    nl: "Er is geen account, geen inlog en er worden geen cookies geplaatst. De app gebruikt geen analytics, volgt je niet met trackers en bouwt geen profiel van je op.",
  },
  privacyLeavesTitle: { en: "What leaves your device", nl: "Wat je apparaat verlaat" },
  privacyLeavesRouting: {
    en: "The start and the end of a trip go to the route planner that works out the options. That is a server run for this app.",
    nl: "Het begin- en eindpunt van een rit gaan naar de routeplanner die de opties uitrekent. Dat is een server die voor deze app draait.",
  },
  // Photon is on the typing path, not the picking path: every keystroke in From and To
  // is a request (api/client.ts, searchPlaces -> photonSearch), which makes it the one
  // recipient that can see a home address being spelled out letter by letter.
  privacyLeavesSearch: {
    en: "What you type into the From and To fields goes to Photon at photon.komoot.io, run by komoot GmbH in Germany, to suggest matching places.",
    nl: "Wat je in de velden Van en Naar typt, gaat naar Photon op photon.komoot.io van komoot GmbH in Duitsland, om passende plekken voor te stellen.",
  },
  privacyLeavesGeocoding: {
    en: "When you pick a point on the map, drag a pin or use your own location, those coordinates go to Nominatim at nominatim.openstreetmap.org, run by the OpenStreetMap Foundation, to be turned into an address.",
    nl: "Als je een punt op de kaart kiest, een markering versleept of je eigen locatie gebruikt, gaan die coördinaten naar Nominatim op nominatim.openstreetmap.org, van de OpenStreetMap Foundation, om er een adres van te maken.",
  },
  privacyLeavesMap: {
    en: "The map is drawn from vector tiles served by OpenFreeMap at tiles.openfreemap.org, and the places on it come from the Overpass API, at overpass-api.de or one of its public mirrors. Both see which part of the map you are looking at. In a browser without WebGL the tiles come from PDOK at service.pdok.nl instead of OpenFreeMap, and PDOK sees it in their place.",
    nl: "De kaart wordt getekend uit vectortegels van OpenFreeMap, op tiles.openfreemap.org, en de plekken erop komen van de Overpass API, via overpass-api.de of een van de openbare mirrors. Ze zien allebei welk stuk van de kaart je bekijkt. In een browser zonder WebGL komen de tegels van PDOK, op service.pdok.nl, in plaats van OpenFreeMap, en ziet PDOK dus welk stuk je bekijkt.",
  },
  privacyLeavesWeather: {
    en: "Open-Meteo receives the coordinates a forecast is asked for. RainViewer serves the radar images.",
    nl: "Open-Meteo krijgt de coördinaten waarvoor een verwachting wordt opgevraagd. RainViewer levert de radarbeelden.",
  },
  privacyLeavesIp: {
    en: "Each of those is a separate organisation, and each sees your IP address the way any website you open does. None of them is asked who you are, and none of them gets a name, an email address or an account.",
    nl: "Dat zijn allemaal aparte organisaties, en ze zien je IP-adres net als elke website die je opent. Geen van hen krijgt te horen wie je bent, en geen van hen krijgt een naam, een e-mailadres of een account.",
  },
  privacyStaysTitle: { en: "What stays on your device", nl: "Wat op je apparaat blijft" },
  privacyStaysWhat: {
    en: "Your recent trips, your saved places and your choice of language and theme are kept in the browser's local storage. Recent trips can include your home and work address, so bear that in mind on a shared computer.",
    nl: "Je recente ritten, je opgeslagen plekken en je keuze voor taal en thema staan in de local storage van je browser. Recente ritten kunnen je thuis- en werkadres bevatten; houd daar rekening mee op een gedeelde computer.",
  },
  privacyStaysClear: {
    en: "None of it is sent anywhere. The menu has “Clear recent searches” and “Clear saved places”, and clearing the browser's site data removes the rest.",
    nl: "Daarvan wordt niets verstuurd. In het menu staan “Wis recente zoekopdrachten” en “Wis opgeslagen plekken”, en de rest verdwijnt als je de sitegegevens van je browser wist.",
  },
  privacyContactTitle: { en: "Who is responsible", nl: "Wie verantwoordelijk is" },
  privacyContact: {
    en: "[PLACEHOLDER: name, postal address and email address of the controller.] The route planner runs at [PLACEHOLDER: hosting provider and country].",
    nl: "[IN TE VULLEN: naam, postadres en e-mailadres van de verwerkingsverantwoordelijke.] De routeplanner draait bij [IN TE VULLEN: hostingpartij en land].",
  },
  privacyUpdated: {
    en: "Last changed: [PLACEHOLDER: date].",
    nl: "Laatst gewijzigd: [IN TE VULLEN: datum].",
  },
} as const;

export type StringKey = keyof typeof STRINGS;

export type Translator = (key: StringKey, params?: Record<string, string | number>) => string;

// Pure lookup for non-component code (lib helpers, callbacks).
export function translate(
  lang: Lang,
  key: StringKey,
  params?: Record<string, string | number>,
): string {
  let out: string = STRINGS[key][lang];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

interface I18n {
  lang: Lang;
  t: Translator;
  toggle: () => void;
}

// The default context value is a fully working English implementation so components
// rendered without a provider (unit tests) behave exactly as before the toggle existed.
const DEFAULT_I18N: I18n = {
  lang: "en",
  t: (key, params) => translate("en", key, params),
  toggle: () => {},
};

const I18nContext = createContext<I18n>(DEFAULT_I18N);

const STORAGE_KEY = "fov.lang.v1";

function initialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "nl") return stored;
  } catch {
    // Private mode or blocked storage: fall through to browser-language detection.
  }
  // Guarded for jsdom and non-browser environments.
  if (typeof navigator !== "undefined" && navigator.language?.startsWith("nl")) return "nl";
  return "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Persistence is best-effort: the toggle still works for the session.
    }
  }, [lang]);

  // index.html ships lang="nl"; a stored/browser preference for English (or the
  // in-app switch) has to move the document with it, or a screen reader keeps reading
  // English copy with Dutch pronunciation rules and translation tools mislabel the page.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      t: (key, params) => translate(lang, key, params),
      toggle: () => setLang((l) => (l === "en" ? "nl" : "en")),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
