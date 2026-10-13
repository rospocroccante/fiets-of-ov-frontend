import type { CSSProperties } from "react";

// A small hash of a place name, so the same trip always gets the same glow.
function seedOf(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// One colour per glow, picked by the destination: violet, blue, pink, coral, teal, purple.
const COLOURS = ["#7c5cff", "#3b82f6", "#ec4899", "#f97362", "#14b8a6", "#a855f7"];

// The mark a trip row leads with, in the manner of Fresha's logo: one colour, full at the
// centre and fading out to nothing, so there is no edge and no circle to see, breathing
// slowly (the .trip-orb rules in index.css). The destination fixes its colour and where
// in the breath it starts, so a trip looks the same wherever it is listed and the rows of
// a list never pulse in step. Decorative: the row's text says everything the glow does.
export function TripOrb({ seed }: { seed: string }) {
  const n = seedOf(seed);
  const style = {
    "--orb-colour": COLOURS[n % COLOURS.length],
    "--orb-delay": `-${(n % 48) / 10}s`,
  } as CSSProperties;
  return <span aria-hidden="true" data-fov="row-glyph" className="trip-orb" style={style} />;
}
