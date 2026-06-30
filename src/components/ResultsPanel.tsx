import type { ScoreResult } from "../lib/score";
import { AdviceCard } from "./AdviceCard";

export type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: ScoreResult };

export function ResultsPanel({ state }: { state: PanelState }) {
  if (state.status === "idle") {
    return (
      <div className="p-6 text-gray-500">
        Enter origin and destination to see the bike-or-transit advice.
      </div>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="space-y-4 p-2">
        <div className="h-48 animate-pulse rounded-card bg-gray-100" />
        <div className="h-48 animate-pulse rounded-card bg-gray-100" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="m-2 rounded-card border border-red-200 bg-red-50 p-4 text-red-700">
        {state.message}
      </div>
    );
  }
  return (
    <div className="space-y-4 p-2">
      {state.result.cards.map((card) => (
        <AdviceCard key={card.mode} card={card} />
      ))}
    </div>
  );
}
