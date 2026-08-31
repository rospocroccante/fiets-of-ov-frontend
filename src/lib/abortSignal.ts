// AbortSignal.any, with manual wiring for engines that shipped AbortSignal.timeout
// before AbortSignal.any (Safari 16.0-17.3, Chrome 103-115). The timeout helpers in
// api/client.ts and hooks/usePois.ts used to fall back to the timeout signal alone
// there, which silently dropped the caller's own signal: a superseded query kept its
// request (and its response parsing) running until the deadline instead of stopping
// the moment the caller moved on.
export function anySignal(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  const ctl = new AbortController();
  for (const s of [a, b]) {
    if (s.aborted) {
      ctl.abort(s.reason);
      break;
    }
    // The controller's own signal unhooks both listeners once either side fires,
    // so the signal that loses the race keeps no reference to the winner.
    s.addEventListener("abort", () => ctl.abort(s.reason), { once: true, signal: ctl.signal });
  }
  return ctl.signal;
}
