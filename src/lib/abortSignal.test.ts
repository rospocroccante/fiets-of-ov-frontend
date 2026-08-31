import { anySignal } from "./abortSignal";

test("aborts when either input aborts, carrying that signal's reason", () => {
  const a = new AbortController();
  const b = new AbortController();
  const s = anySignal(a.signal, b.signal);
  expect(s.aborted).toBe(false);
  b.abort(new Error("deadline"));
  expect(s.aborted).toBe(true);
  expect((s.reason as Error).message).toBe("deadline");
});

test("an already-aborted input aborts the combination immediately", () => {
  const a = new AbortController();
  a.abort("gone");
  const s = anySignal(a.signal, new AbortController().signal);
  expect(s.aborted).toBe(true);
  expect(s.reason).toBe("gone");
});

test("the manual fallback wires both signals where AbortSignal.any is missing", () => {
  // Safari 16.0-17.3 shipped AbortSignal.timeout without AbortSignal.any; the helper exists for exactly this gap.
  const original = AbortSignal.any;
  (AbortSignal as unknown as { any: unknown }).any = undefined;
  try {
    const outer = new AbortController();
    const s = anySignal(outer.signal, new AbortController().signal);
    expect(s.aborted).toBe(false);
    outer.abort(new Error("superseded"));
    expect(s.aborted).toBe(true);
    expect((s.reason as Error).message).toBe("superseded");
  } finally {
    (AbortSignal as unknown as { any: unknown }).any = original;
  }
});
