import type { CSSProperties } from "react";

// The home's living background: vivid drifting colour blobs, the one place in the UI
// where colour runs free (the foreground stays clean and calm on purpose). Purely
// decorative and aria-hidden; the motion is CSS-only (see index.css .aurora-blob +
// @keyframes), so nothing runs on the main thread per frame. Normal blending on the
// light backdrop keeps the saturated colours reading true (screen would wash them to
// white); each blob fades to transparent at its rim so overlaps layer softly.
interface Blob {
  color: string;
  size: string;
  opacity: number;
  anim: "aurora-a" | "aurora-b" | "aurora-c";
  duration: string;
  delay: string;
  pos: Pick<CSSProperties, "top" | "left" | "right" | "bottom">;
}

// The palette is Amsterdam's: Mondrian's primaries (flag red, NS yellow, GVB blue)
// with the canal navy, the open sky, and the bike-route green drifting between them.
const BLOBS: Blob[] = [
  { color: "#0077C8", size: "40rem", opacity: 0.6, anim: "aurora-a", duration: "24s", delay: "0s", pos: { top: "-10rem", left: "-10rem" } },
  { color: "#DA291C", size: "34rem", opacity: 0.5, anim: "aurora-b", duration: "28s", delay: "-6s", pos: { top: "-6rem", right: "-8rem" } },
  { color: "#38BDF8", size: "36rem", opacity: 0.6, anim: "aurora-c", duration: "32s", delay: "-3s", pos: { bottom: "-10rem", right: "2rem" } },
  { color: "#FFC917", size: "28rem", opacity: 0.55, anim: "aurora-b", duration: "26s", delay: "-12s", pos: { bottom: "-8rem", left: "0rem" } },
  { color: "#0D4A73", size: "30rem", opacity: 0.5, anim: "aurora-a", duration: "30s", delay: "-16s", pos: { top: "26%", left: "30%" } },
  { color: "#10B981", size: "26rem", opacity: 0.45, anim: "aurora-c", duration: "22s", delay: "-9s", pos: { top: "38%", right: "22%" } },
];

export function HomeAurora() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden="true"
    >
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
