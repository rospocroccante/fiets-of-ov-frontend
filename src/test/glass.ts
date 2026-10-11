// The "glass" a container is not allowed to wear any more, read off the rendered class
// names of everything under `root`: a backdrop blur, a drop shadow, a ring, a hover
// lift, or a translucent-white fill or rim. jsdom has no Tailwind, so the class is the
// only thing a unit test can see; the pixels are measured in browser-tests/.
//
// One shadow is allowed by name: the chosen option's 3px accent bar is an *inset*
// shadow (`shadow-[inset_...]`), which draws a stripe on the block's own edge and lifts
// nothing off the page.
export function glassClasses(root: Element): string[] {
  const found: string[] = [];
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const cls of el.classList) {
      const parts = cls.split(":");
      const utility = parts[parts.length - 1];
      const variants = parts.slice(0, -1);
      const glass =
        /^backdrop-blur/.test(utility) ||
        /^shadow(-(sm|md|lg|xl|2xl|inner))?$/.test(utility) ||
        /^shadow-\[(?!inset)/.test(utility) ||
        /^ring(-|$)/.test(utility) ||
        (variants.includes("hover") && /^-?translate-[xy]/.test(utility)) ||
        /^(bg|border)-white\/\d+$/.test(utility);
      if (glass) found.push(`${el.tagName.toLowerCase()}: ${cls}`);
    }
  }
  return found;
}
