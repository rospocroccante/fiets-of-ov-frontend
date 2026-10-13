import type { CSSProperties } from "react";

// A small hash of a place name, so the same trip always gets the same orb.
function seedOf(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// The charm a trip row leads with: a 40px orb of colour that turns slowly, breathes and
// sends out a ring of light now and then (the .trip-orb rules in index.css). Its seed,
// the destination, fixes where in the cycle it starts and how far its colours are turned,
// so the rows of a list never pulse in step and a trip keeps its own colours wherever it
// is listed. Decorative: the row's text says everything the orb does.
export function TripOrb({ seed }: { seed: string }) {
  const n = seedOf(seed);
  const style = {
    "--orb-delay": `-${(n % 90) / 10}s`,
    "--orb-hue": `${(n % 71) - 35}deg`,
  } as CSSProperties;
  return <span aria-hidden="true" data-fov="row-glyph" className="trip-orb" style={style} />;
}
