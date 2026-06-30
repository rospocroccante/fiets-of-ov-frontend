import type { CardModel } from "../lib/score";

const ICON: Record<CardModel["mode"], string> = { bike: "Bike", transit: "Transit" };

export function AdviceCard({ card }: { card: CardModel }) {
  return (
    <article className="rounded-card border border-gray-100 bg-white p-4 shadow-sm">
      <div className="relative mb-3 flex h-32 items-center justify-center rounded-card bg-brand-light">
        {card.recommended && (
          <span className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
            Recommended
          </span>
        )}
        <span className="text-3xl font-bold text-brand">{ICON[card.mode]}</span>
      </div>

      <div className="flex items-start justify-between">
        <h3 className="text-lg font-semibold">{card.title}</h3>
        <span className="shrink-0 text-sm font-semibold text-brand">
          {card.minutes != null ? `${card.minutes} min` : "n/a"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {card.chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-brand/30 px-3 py-1 text-xs font-medium text-brand"
          >
            {chip}
          </span>
        ))}
      </div>

      {card.reason && <p className="mt-3 text-sm text-gray-600">{card.reason}</p>}
    </article>
  );
}
