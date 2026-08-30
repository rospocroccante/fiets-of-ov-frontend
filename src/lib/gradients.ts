// Colour and energy live in the animated background (HomeAurora). The foreground stays
// calm, so exactly one refined accent gradient is shared here and used sparingly: the
// primary Search action and a single headline accent line. Everything else that needs
// an "active" colour uses the solid brand navy. The family is Amsterdam's own: canal
// navy flowing into GVB transit blue, headline in sky-into-canal (the weather is the
// product), and the four semantic accents (position red, GVB blue, bike green, sun
// yellow) on the popular-trip cards.
// Dark theme swaps the family to the NS-yellow range (the dark UI's accent
// colour) and carries its own text pairing: navy on yellow, like the signage.
export const PRIMARY_GRADIENT =
  "bg-gradient-to-r from-[#0D4A73] to-[#0077C8] dark:from-night-accent dark:to-amber-500 dark:text-night-bg";

export const TEXT_GRADIENT =
  "bg-gradient-to-r from-[#0EA5E9] to-[#0D4A73] bg-clip-text text-transparent dark:from-night-accent-soft dark:to-night-accent";

// Small, restrained accents for the popular-trip cards: used only on a dot and a
// connector line, never as a card fill. One per semantic: position, transit, bike,
// weather.
export const CARD_ACCENTS = ["#DA291C", "#0077C8", "#059669", "#EAB308"];
