// WMO weather codes (Open-Meteo) mapped to Material Symbols glyphs and short labels.
// Keep the glyph set in sync with the icon_names list in index.html.
import { translate } from "./i18n";
import type { Lang, StringKey } from "./i18n";

export interface WeatherLook {
  icon: string;
  label: string;
}

function look(icon: string, key: StringKey, lang: Lang): WeatherLook {
  return { icon, label: translate(lang, key) };
}

export function weatherLook(code: number, isDay: boolean, lang: Lang = "en"): WeatherLook {
  if (code === 0) return look(isDay ? "sunny" : "bedtime", "weatherClear", lang);
  if (code === 1 || code === 2)
    return look(isDay ? "partly_cloudy_day" : "partly_cloudy_night", "weatherPartlyCloudy", lang);
  if (code === 3) return look("cloud", "weatherOvercast", lang);
  if (code === 45 || code === 48) return look("foggy", "weatherFog", lang);
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return look("rainy", "weatherRain", lang);
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return look("weather_snowy", "weatherSnow", lang);
  if (code >= 95) return look("thunderstorm", "weatherThunderstorm", lang);
  return look("cloud", "weatherClouds", lang);
}
