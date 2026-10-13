import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { WeatherStrip } from "./WeatherStrip";
import { glassClasses } from "../test/glass";

// framer reads the system setting once per process, so the hook is mocked instead.
vi.mock("framer-motion", async (importOriginal) => ({
  ...(await importOriginal<typeof import("framer-motion")>()),
  useReducedMotion: vi.fn(() => false),
}));

beforeEach(() => {
  vi.mocked(useReducedMotion).mockReturnValue(false);
});

function renderStrip(compact = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <WeatherStrip lat={52.37} lon={4.89} compact={compact} />
    </QueryClientProvider>,
  );
}

test("renders current temperature, hourly slots and rain probability from the forecast", async () => {
  renderStrip();
  // Mock fixture: 18 degrees now, partly cloudy; rain at 70% in the 16:00 slot.
  // The degree sign is a separate JSX text node, so match on the element's textContent.
  expect(await screen.findByText("Partly cloudy")).toBeInTheDocument();
  expect(
    screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "18°"),
  ).toBeInTheDocument();
  expect(screen.getByText("16:00")).toBeInTheDocument();
  expect(
    screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "70%"),
  ).toBeInTheDocument();
});

// The feed hands over ten hours. All ten used to be rendered into an `overflow-x-auto`
// box with no scroll affordance, which at 390 wide left 200px of them — four whole
// hours — behind an edge nothing suggested you could drag. What is not reachable is not
// shown, so the strip renders the number it has room for. jsdom answers false to every
// media query, which is the narrow tier.
test("a narrow column gets the hours it has room for, and no hidden ones", async () => {
  renderStrip();
  await screen.findByText("Partly cloudy");
  const hours = screen.getByRole("list");
  expect(within(hours).getAllByRole("listitem")).toHaveLength(4);
  // The fifth slot is not merely off screen: it is not in the document at all.
  expect(screen.queryByText("18:00")).not.toBeInTheDocument();
});

// The phone tier. The strip stands above the option rows in a results column that is
// the bottom third of the display, so it is 55px there instead of 85.5. What it spends
// those pixels on is leading and glyph size, not content: every hour the wide strip
// shows is still here, with its temperature and its rain chance, and the condition in
// words moves into the accessible name rather than off the page. The heights are
// measured in browser-tests/specs/results.checks.mjs; jsdom can only prove the content.
test("compact keeps every hour, every temperature and every rain chance", async () => {
  renderStrip(true);
  await screen.findByText("Partly cloudy");
  const hours = screen.getByRole("list");
  expect(within(hours).getAllByRole("listitem")).toHaveLength(4);
  expect(screen.getByText("16:00")).toBeInTheDocument();
  expect(
    screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "70%"),
  ).toBeInTheDocument();
  expect(
    screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "18°"),
  ).toBeInTheDocument();
});

test("compact keeps the condition readable to a screen reader after it stops being drawn", async () => {
  renderStrip(true);
  const label = await screen.findByText("Partly cloudy");
  expect(label.className).toContain("sr-only");
  // And the pointer still gets it, from the block's own title.
  expect(label.closest("[title]")).toHaveAttribute("title", "Partly cloudy");
});

// The strip is a plain row over the results now, with one hairline under it: the frosted
// card it was is the first of the nested boxes the results column no longer draws.
test("the strip is a row with a hairline under it and no box", async () => {
  for (const compact of [false, true]) {
    const { container, unmount } = renderStrip(compact);
    await screen.findByText("Partly cloudy");
    const strip = container.querySelector<HTMLElement>('[data-fov="weather-strip"]')!;
    expect(strip).toHaveClass("border-b", "border-slate-200", "dark:border-night-rim/20");
    expect([...strip.classList].filter((c) => /^(dark:)?(bg-|rounded|shadow|ring|border-[trlx]?$)/.test(c))).toEqual(
      [],
    );
    expect(glassClasses(container)).toEqual([]);
    unmount();
  }
});

// The strip mounts when its forecast lands, a moment after the render, and framer moves
// it from its initial pose on its next frame after that. A mutation observer reads the
// strip as it is inserted, which is that first pose. The wait goes through waitFor, the
// act-safe wait: the forecast landing is a React update.
function watchFirstPose(): () => { opacity: string; transform: string } | undefined {
  let pose: { opacity: string; transform: string } | undefined;
  const seen = new MutationObserver(() => {
    const strip = document.querySelector<HTMLElement>('[data-fov="weather-strip"]');
    if (!strip) return;
    seen.disconnect();
    pose = { opacity: strip.style.opacity, transform: strip.style.transform };
  });
  seen.observe(document.body, { childList: true, subtree: true });
  return () => pose;
}

test("the strip arrives with a fade and an 8px rise, and comes to rest", async () => {
  const firstPose = watchFirstPose();
  const { container } = renderStrip();
  await waitFor(() => expect(firstPose()).toEqual({ opacity: "0", transform: "translateY(8px)" }));
  const strip = container.querySelector<HTMLElement>('[data-fov="weather-strip"]')!;
  await waitFor(() => expect(strip.style.opacity).toBe("1"));
  expect(strip.style.transform).toBe("none");
});

test("under reduced motion the strip fades in without moving", async () => {
  vi.mocked(useReducedMotion).mockReturnValue(true);
  const firstPose = watchFirstPose();
  const { container } = renderStrip();
  await waitFor(() => expect(firstPose()).toEqual({ opacity: "0", transform: "" }));
  const strip = container.querySelector<HTMLElement>('[data-fov="weather-strip"]')!;
  await waitFor(() => expect(strip.style.opacity).toBe("1"));
  expect(strip.style.transform).toBe("");
});
