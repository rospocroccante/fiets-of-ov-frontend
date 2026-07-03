import type { CSSProperties } from "react";

// Decorative drifting light blobs for the home background. Purely presentational and
// aria-hidden; the motion lives in CSS (see index.css .aurora-blob + @keyframes) so no
// JS runs per frame. Colours are soft tints biased to the brand blues with a teal and a
// warm accent, kept low-opacity so hero text stays readable on top.
interface Blob {
  color: string;
  size: string;
  opacity: number;
  anim: "aurora-a" | "aurora-b" | "aurora-c";
  duration: string;
  delay: string;
  pos: Pick<CSSProperties, "top" | "left" | "right" | "bottom">;
}

// Same family as the transport palette (lib/modeColors): blues and indigo around the
// brand, teal for water, one soft amber counterpoint.
const BLOBS: Blob[] = [
  { color: "#60a5fa", size: "36rem", opacity: 0.55, anim: "aurora-a", duration: "23s", delay: "0s", pos: { top: "-6rem", left: "-8rem" } },
  { color: "#818cf8", size: "32rem", opacity: 0.5, anim: "aurora-b", duration: "27s", delay: "-6s", pos: { top: "-4rem", right: "-6rem" } },
  { color: "#2dd4bf", size: "30rem", opacity: 0.42, anim: "aurora-c", duration: "31s", delay: "-3s", pos: { bottom: "-8rem", right: "4rem" } },
  { color: "#fcd34d", size: "28rem", opacity: 0.35, anim: "aurora-b", duration: "25s", delay: "-11s", pos: { bottom: "-6rem", left: "2rem" } },
  { color: "#93c5fd", size: "26rem", opacity: 0.4, anim: "aurora-a", duration: "29s", delay: "-15s", pos: { top: "28%", left: "34%" } },
];

export function HomeAurora() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {BLOBS.map((b, i) => (
        <span
          key={i}
          className="aurora-blob"
          style={{
            width: b.size,
            height: b.size,
            opacity: b.opacity,
            background: `radial-gradient(circle at center, ${b.color} 0%, transparent 70%)`,
            animation: `${b.anim} ${b.duration} ease-in-out ${b.delay} infinite alternate`,
            ...b.pos,
          }}
        />
      ))}
    </div>
  );
}
