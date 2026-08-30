// Colour and energy live in the animated background (HomeAurora). The foreground stays
// calm, so exactly one refined accent gradient is shared here and used sparingly: the
// primary Search action and a single headline accent line. Everything else that needs
// an "active" colour uses the solid brand navy. The family is Amsterdam's own: canal
// navy flowing into GVB transit blue, headline in sky-into-canal (the weather is the
// product), and the four semantic accents (position red, GVB blue, bike green, sun
// yellow) on the popular-trip cards.
// Dark theme swaps the family to the green range (the dark UI's accent colour).
export const PRIMARY_GRADIENT =
  "bg-gradient-to-r from-[#0D4A73] to-[#0077C8] dark:from-emerald-600 dark:to-lime-500";

export const TEXT_GRADIENT =
  "bg-gradient-to-r from-[#0EA5E9] to-[#0D4A73] bg-clip-text text-transparent dark:from-emerald-300 dark:to-lime-300";

// Small, restrained accents for the popular-trip cards: used only on a dot and a
// connector line, never as a card fill. One per semantic: position, transit, bike,
// weather.
export const CARD_ACCENTS = ["#DA291C", "#0077C8", "#059669", "#EAB308"];
