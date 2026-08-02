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
    en: "Rain-aware bike vs transit advice for Amsterdam. Routing by OpenTripPlanner. Map data © OpenStreetMap contributors, tiles © CARTO. Rain radar by RainViewer, weather by Open-Meteo, places via Overpass.",
    nl: "Regenbewust fiets-of-OV-advies voor Amsterdam. Routes door OpenTripPlanner. Kaartdata © OpenStreetMap-bijdragers, tiles © CARTO. Regenradar door RainViewer, weer door Open-Meteo, plekken via Overpass.",
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
