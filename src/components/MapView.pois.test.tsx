import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MapView, poiIconName, poiMarkerHtml } from "./MapView";
import { I18nProvider } from "../lib/i18n";

// The POI health pill is the layer's only honest signal, and the difference between its
// two states matters: a total outage means "we cannot show places", a partial one means
// "these places are real, there are just more". usePois' own test covers deciding which
// is which; this covers the pill actually saying so, in the user's language.
const poi = vi.hoisted(() => ({
  state: { pois: [] as never[], error: false, partial: false },
}));
vi.mock("../hooks/usePois", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/usePois")>();
  return { ...actual, usePois: () => poi.state };
});

function renderMap(lang: "en" | "nl" = "en") {
  window.localStorage.setItem("fov.lang.v1", lang);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MapView origin={null} destination={null} stops={[]} route={null} interactive />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  poi.state = { pois: [], error: false, partial: false };
});

test("a healthy POI layer shows no pill at all", () => {
  renderMap();
  expect(screen.queryByText(/places/i)).toBeNull();
});

test("a partial outage gets the amber 'some places are missing' pill", () => {
  poi.state = { pois: [], error: false, partial: true };
  renderMap();
  const pill = screen.getByText("Some places are missing here");
  expect(pill).toBeInTheDocument();
  // Amber, not red: the labels on screen are real, just incomplete.
  expect(pill.className).toContain("text-amber-600");
  expect(pill.className).not.toContain("text-red-600");
});

test("a full outage gets the red 'places unavailable' pill instead", () => {
  poi.state = { pois: [], error: true, partial: false };
  renderMap();
  const pill = screen.getByText("Places unavailable right now");
  expect(pill.className).toContain("text-red-600");
  expect(screen.queryByText("Some places are missing here")).toBeNull();
});

// Maki category icons. The raw OSM tag picks the icon — a cafe cup is not a
// cocktail glass even though both kinds are "drink" — and the kind only steps
// in for POIs persisted by poiStore before the tag field existed, so old
// caches degrade to a sensible icon instead of a blank badge. The
// react-leaflet mock never renders real divIcons, so the pure html seam is
// where the markup gets asserted.
test("the OSM tag picks the Maki icon, kind is only the fallback", () => {
  expect(poiIconName({ kind: "drink", tag: "cafe" })).toBe("cafe");
  expect(poiIconName({ kind: "drink", tag: "bar" })).toBe("bar");
  expect(poiIconName({ kind: "drink", tag: "pub" })).toBe("beer");
  expect(poiIconName({ kind: "food", tag: "restaurant" })).toBe("restaurant");
  expect(poiIconName({ kind: "food", tag: "ice_cream" })).toBe("ice-cream");
  expect(poiIconName({ kind: "culture", tag: "gallery" })).toBe("art-gallery");
  // Cached POIs predating the tag field: per-kind fallback, never a blank badge.
  expect(poiIconName({ kind: "culture" })).toBe("museum");
  expect(poiIconName({ kind: "other", tag: null })).toBe("marker");
});

test("marker html inlines the Maki svg in a coloured badge and still escapes the name", () => {
  const html = poiMarkerHtml({
    id: "x1",
    name: "Jack's <Bar>",
    kind: "drink",
    kindLabel: "Bar",
    tag: "bar",
    lat: 52.37,
    lon: 4.89,
  });
  expect(html).toContain('class="poi-badge"');
  // A real inline svg — with the XML prolog stripped, because this string goes
  // through divIcon innerHTML where "<?xml" would parse as a bogus comment.
  expect(html).toContain("<svg");
  expect(html).toContain('viewBox="0 0 15 15"');
  expect(html).not.toContain("<?xml");
  // The badge is decorative: hidden from screen readers, and an svg has no
  // ligature text for find-in-page to match.
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain("Jack&#39;s &lt;Bar&gt;");
  expect(html).not.toContain("<Bar>");
});

// A name → svg lookup that misses would render an empty badge, which is exactly
// the failure mode the old font subset had with unknown ligatures. Every tag we
// map and every kind fallback must resolve to a bundled svg.
test("every mapped tag and kind fallback resolves to an inline svg", () => {
  const tags = ["restaurant", "fast_food", "ice_cream", "cafe", "bar", "pub", "museum", "attraction", "gallery"];
  for (const tag of tags) {
    const html = poiMarkerHtml({ id: tag, name: tag, kind: "food", kindLabel: "x", tag, lat: 0, lon: 0 });
    expect(html, tag).toContain("<svg");
  }
  for (const kind of ["food", "drink", "culture", "other"] as const) {
    const html = poiMarkerHtml({ id: kind, name: kind, kind, kindLabel: "x", tag: null, lat: 0, lon: 0 });
    expect(html, kind).toContain("<svg");
  }
});

test("the pills are translated", () => {
  poi.state = { pois: [], error: false, partial: true };
  const { unmount } = renderMap("nl");
  expect(screen.getByText("Hier ontbreken enkele plekken")).toBeInTheDocument();
  unmount();

  poi.state = { pois: [], error: true, partial: false };
  renderMap("nl");
  expect(screen.getByText("Plekken zijn nu niet beschikbaar")).toBeInTheDocument();
});
