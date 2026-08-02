import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MapView } from "./MapView";
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

test("the pills are translated", () => {
  poi.state = { pois: [], error: false, partial: true };
  const { unmount } = renderMap("nl");
  expect(screen.getByText("Hier ontbreken enkele plekken")).toBeInTheDocument();
  unmount();

  poi.state = { pois: [], error: true, partial: false };
  renderMap("nl");
  expect(screen.getByText("Plekken zijn nu niet beschikbaar")).toBeInTheDocument();
});
