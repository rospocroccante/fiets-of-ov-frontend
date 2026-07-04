// WMO weather codes (Open-Meteo) mapped to Material Symbols glyphs and short labels.
// Keep the glyph set in sync with the icon_names list in index.html.
export interface WeatherLook {
  icon: string;
  label: string;
}

export function weatherLook(code: number, isDay: boolean): WeatherLook {
  if (code === 0) return isDay ? { icon: "sunny", label: "Clear" } : { icon: "bedtime", label: "Clear" };
  if (code === 1 || code === 2)
    return isDay
      ? { icon: "partly_cloudy_day", label: "Partly cloudy" }
      : { icon: "partly_cloudy_night", label: "Partly cloudy" };
  if (code === 3) return { icon: "cloud", label: "Overcast" };
  if (code === 45 || code === 48) return { icon: "foggy", label: "Fog" };
  if ((code >= 51 && code <= 57) || (code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { icon: "rainy", label: "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: "weather_snowy", label: "Snow" };
  if (code >= 95) return { icon: "thunderstorm", label: "Thunderstorm" };
  return { icon: "cloud", label: "Clouds" };
}
