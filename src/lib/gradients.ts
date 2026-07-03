// Colour and energy live in the animated background (HomeAurora). The foreground stays
// calm, so exactly one refined accent gradient is shared here and used sparingly: the
// primary Search action and a single headline accent line. Everything else that needs
// an "active" colour uses the solid brand navy.
export const PRIMARY_GRADIENT = "bg-gradient-to-r from-indigo-500 to-violet-500";

export const TEXT_GRADIENT =
  "bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent";

// Small, restrained accents for the popular-trip cards: used only on a dot and a
// connector line, never as a card fill. Drawn from the background's colour family.
export const CARD_ACCENTS = ["#6366f1", "#8b5cf6", "#06b6d4", "#f59e0b"];
