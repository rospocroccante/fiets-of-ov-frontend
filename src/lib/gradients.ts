// Colour and energy live in the animated background (HomeAurora). The foreground stays
// calm, so exactly one accent gradient is shared here, on the primary Search action:
// canal navy flowing into GVB transit blue. The headline's accent line is a solid brand
// navy (NS geel at night), and everything else that needs an "active" colour uses the
// solid brand navy too. The four semantic accents (position red, GVB blue, bike green,
// sun yellow) are the line colours of the popular trips.
// Dark theme: the Search action goes shaded white, white easing into the palest brand
// blue with navy text.
export const PRIMARY_GRADIENT =
  "bg-gradient-to-r from-[#0D4A73] to-[#0077C8] dark:from-white dark:to-brand-light dark:text-night-bg";

// The popular trips' line colours. Each trip is drawn as a metro line and this is its
// track, a 4px stroke and never a fill behind text. One per semantic: position,
// transit, bike, weather.
export const CARD_ACCENTS = ["#DA291C", "#0077C8", "#059669", "#EAB308"];
