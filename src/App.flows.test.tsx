import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { getPlan, liveGetPlan } from "./api/client";
import { __fireMapContextMenu } from "./__mocks__/react-leaflet";
import { whenMapMounted } from "./test/mapReady";

// The end-to-end regression net for the flows a user actually performs. Everything the
// rest of the suite renders bare (no I18nProvider, single components) is exercised here
// through the real provider tree, because that is where the wiring bugs live: a
// provider-less render silently falls back to the default English context whose toggle
// is a no-op, so a broken language switch would pass every other test in the repo.
//
// The planner is the real mock-mode one, wrapped in a spy so refetch counts are
// assertable and single calls can be swapped for the live path plus a stubbed fetch.
vi.mock("./api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/client")>();
  return { ...actual, getPlan: vi.fn(actual.getPlan) };
});

// The unmocked planner, kept so every test can start from the mock-mode fixture again:
// clearing a spy keeps whatever implementation the previous test installed, which would
// leave the live-path error test's stubbed fetch wired into everything after it.
const realClient = await vi.importActual<typeof import("./api/client")>("./api/client");

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// Fills both endpoints and submits, the way the search pill is used.
function search(from = "Centraal", to = "Dam") {
  fireEvent.change(screen.getByPlaceholderText("From"), { target: { value: from } });
  fireEvent.change(screen.getByPlaceholderText("To"), { target: { value: to } });
  fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
}

// "Menu ☰" opens the header menu; /^menu/i keeps it apart from "Close menu", which is
// the full-screen dismiss button rendered alongside the open dropdown.
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /^menu/i }));
}

const planReady = () =>
  waitFor(() => {
    if ((screen.getByText(/routes in (area|beeld)/i).textContent ?? "").startsWith("0")) {
      throw new Error("plan still loading");
    }
  });

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.mocked(getPlan).mockReset();
  vi.mocked(getPlan).mockImplementation(realClient.getPlan);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the home language switch flips every visible string, both ways, and persists it", () => {
  renderApp();
  // jsdom reports navigator.language "en-US", so the app starts in English.
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bike or transit?");
  expect(screen.getByText("to Vondelpark")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /switch language/i }));

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fiets of OV?");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Laat het weer beslissen.");
  // Parameterized strings must follow the language, not just the static ones.
  expect(screen.getByText("naar Vondelpark")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zoeken" })).toBeInTheDocument();
  expect(window.localStorage.getItem("fov.lang.v1")).toBe("nl");

  fireEvent.click(screen.getByRole("button", { name: /wissel van taal/i }));

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bike or transit?");
  expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
  expect(window.localStorage.getItem("fov.lang.v1")).toBe("en");
});

test("the header menu's language row switches the app and renames itself", () => {
  renderApp();
  openMenu();
  // Named in the language it switches TO, so an English UI offers "Nederlands".
  fireEvent.click(screen.getByRole("button", { name: "Nederlands" }));

  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fiets of OV?");
  // The menu stays open so the flip is visible, and the row now offers the way back.
  expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nederlands" })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Bike or transit?");
  expect(window.localStorage.getItem("fov.lang.v1")).toBe("en");
});

test("a stored language wins over the browser default on the next visit", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  renderApp();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fiets of OV?");
});

test("the theme switch drives the dark class on <html> and persists the choice", () => {
  renderApp();
  expect(document.documentElement.classList.contains("dark")).toBe(false);

  fireEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(window.localStorage.getItem("fov.theme.v1")).toBe("dark");

  fireEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(window.localStorage.getItem("fov.theme.v1")).toBe("light");
});

test("a search renders the ranked options, the recommendation and the weather verdict", async () => {
  renderApp();
  search();
  await planReady();

  // Both options from the fixture, the Best tag on the recommended one, and the
  // rewritten backend reason in the banner.
  expect(screen.getByRole("heading", { name: "By bike" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Public transport" })).toBeInTheDocument();
  expect(screen.getByText("Best")).toBeInTheDocument();
  expect(screen.getByText("Dry")).toBeInTheDocument();
  expect(
    screen.getByText(/It should stay dry for your 24-minute ride \(rain starts around 15:40\)\./),
  ).toBeInTheDocument();
  expect(screen.getByText("2 routes in area")).toBeInTheDocument();
});

test("the plan text follows a language switch without refetching the plan", async () => {
  renderApp();
  search();
  await planReady();
  expect(getPlan).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: /switch language/i }));

  expect(screen.getByRole("heading", { name: "Met de fiets" })).toBeInTheDocument();
  expect(screen.getByText("Droog")).toBeInTheDocument();
  expect(screen.getByText("2 routes in beeld")).toBeInTheDocument();
  // The view is rebuilt from the cached plan; the language is not a query key.
  expect(getPlan).toHaveBeenCalledTimes(1);
});

test("searching the same route twice re-plans instead of replaying the first answer", async () => {
  renderApp();
  search();
  await planReady();
  expect(getPlan).toHaveBeenCalledTimes(1);

  // Identical endpoints: only the submit nonce changes, and that is what has to make
  // the second Search fetch fresh departure times.
  fireEvent.click(screen.getByRole("button", { name: /^search$/i }));
  await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2));
});

test("a 404 and a 502 from the planner reach the user as their own messages", async () => {
  // Drive the real live-mode path so the whole chain is covered: HTTP status -> the
  // backend's detail field -> the thrown Error -> the results panel's error card.
  vi.mocked(getPlan).mockImplementation((from, to) => liveGetPlan(from, to));

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "no route found between these points" }),
    }),
  );
  const notFound = renderApp();
  search();
  expect(await screen.findByText("no route found between these points")).toBeInTheDocument();
  notFound.unmount();

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ detail: "routing upstream unavailable" }),
    }),
  );
  renderApp();
  search();
  expect(await screen.findByText("routing upstream unavailable")).toBeInTheDocument();
  // The two failures must not collapse into one generic card.
  expect(screen.queryByText("no route found between these points")).toBeNull();
});

test("a search lands in recents, and the recent row re-plans it", async () => {
  renderApp();
  search("Centraal", "Dam");
  await planReady();
  expect(getPlan).toHaveBeenCalledTimes(1);

  // The home shortcuts stay mounted behind the map stage, so the row is assertable
  // without driving the morph.
  const row = await screen.findByRole("button", { name: /Centraal.*Dam/ });
  expect(JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]")).toHaveLength(1);

  fireEvent.click(row);
  await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2));
  await planReady();
});

test("clearing recents from the menu empties both the store and the home shortcuts", async () => {
  renderApp();
  search("Centraal", "Dam");
  await screen.findByRole("button", { name: /Centraal.*Dam/ });

  openMenu();
  fireEvent.click(screen.getByRole("button", { name: /clear recent searches/i }));

  expect(JSON.parse(window.localStorage.getItem("fov.recentTrips.v1") ?? "[]")).toEqual([]);
  expect(screen.queryByRole("button", { name: /Centraal.*Dam/ })).toBeNull();
});

test("a saved place becomes a home chip that plans a trip to it", async () => {
  renderApp();
  search();
  await planReady();

  // Save Vondelpark from the map's place card.
  await whenMapMounted();
  act(() => __fireMapContextMenu(52.3581, 4.8687));
  fireEvent.click(await screen.findByRole("button", { name: /what's here/i }));
  fireEvent.click(await screen.findByRole("button", { name: /save this place/i }));
  fireEvent.click(screen.getByRole("button", { name: /close place info/i }));

  // The saved chip's accessible name is just the place name (the star is aria-hidden).
  const chip = await screen.findByRole("button", { name: /^vondelpark$/i });
  fireEvent.click(chip);

  // The chip means "directions to here": it becomes the destination and re-plans.
  expect(screen.getByPlaceholderText("To")).toHaveValue("vondelpark");
  await waitFor(() => expect(getPlan).toHaveBeenCalledTimes(2));
  expect(vi.mocked(getPlan).mock.calls[1][1]).toMatch(/^52\.\d+,4\.\d+$/);
});

test("clearing saved places from the menu removes the home chip", async () => {
  renderApp();
  search();
  await planReady();
  await whenMapMounted();
  act(() => __fireMapContextMenu(52.3581, 4.8687));
  fireEvent.click(await screen.findByRole("button", { name: /what's here/i }));
  fireEvent.click(await screen.findByRole("button", { name: /save this place/i }));
  fireEvent.click(screen.getByRole("button", { name: /close place info/i }));
  await screen.findByRole("button", { name: /^vondelpark$/i });

  openMenu();
  fireEvent.click(screen.getByRole("button", { name: /clear saved places/i }));

  expect(screen.queryByRole("button", { name: /^vondelpark$/i })).toBeNull();
  expect(JSON.parse(window.localStorage.getItem("fov.savedPlaces.v1") ?? "[]")).toEqual([]);
});

// --- Privacy notice ---------------------------------------------------------------
// A trip planner that posts coordinates to a third party and keeps home and work
// addresses in localStorage has to say so somewhere a reader can reach without being
// told where to look. These pin the two ways in and the substance of what it claims.

// Both morph stages are always mounted, so both ways into the notice exist at once
// (one of them inert). Every query for one of them is scoped to its own stage.
function openPrivacyFromHome() {
  const home = document.querySelector("#fov-home-main") as HTMLElement;
  fireEvent.click(within(home).getByRole("button", { name: /^privacy$/i }));
}

test("the privacy notice opens from the home, over whichever stage is on screen", () => {
  renderApp();
  expect(screen.queryByRole("dialog")).toBeNull();

  openPrivacyFromHome();

  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(within(dialog).getByRole("heading", { name: /^privacy$/i })).toBeInTheDocument();
});

test("the privacy notice is also reachable from the header menu on the map stage", async () => {
  renderApp();
  await whenMapMounted();
  openMenu();
  const menu = screen.getByRole("navigation", { name: /^menu$/i });
  fireEvent.click(within(menu).getByRole("button", { name: /^privacy$/i }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("the notice names every third party that receives what the user typed or picked", () => {
  renderApp();
  openPrivacyFromHome();
  const dialog = screen.getByRole("dialog");

  // The reverse geocoder in geocode.ts posts to this host; a notice that omitted it
  // would be wrong rather than merely thin.
  expect(dialog).toHaveTextContent("nominatim.openstreetmap.org");
  // And the autocomplete in api/client.ts sends every keystroke from From and To to
  // this one, which is a home address spelled out letter by letter to a company in
  // another country. The notice claims to enumerate the recipients ("Each of those is
  // a separate organisation"), so an omission here makes the whole document false.
  expect(dialog).toHaveTextContent("photon.komoot.io");
  expect(dialog).toHaveTextContent(/Photon/);
  expect(dialog).toHaveTextContent(/komoot GmbH/);
  // The POI source is reached at one of three public servers (hooks/usePois.ts).
  expect(dialog).toHaveTextContent("overpass-api.de");
  // Both tile hosts, because the browser talks to whichever one it can render:
  // OpenFreeMap for the vector map, PDOK when there is no WebGL to draw it with
  // (components/Basemap). Naming only the first made the notice false on the
  // fallback path.
  expect(dialog).toHaveTextContent("tiles.openfreemap.org");
  expect(dialog).toHaveTextContent("service.pdok.nl");
  expect(dialog).toHaveTextContent(/no account, no login and no cookie/i);
  expect(dialog).toHaveTextContent(/local storage/i);
  // The unfilled owner details must be impossible to miss until someone fills them.
  expect(dialog).toHaveTextContent(/PLACEHOLDER/);
});

test("the notice is in Dutch when the app is, and closes on Escape", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  renderApp();
  openPrivacyFromHome();

  const dialog = screen.getByRole("dialog");
  // Plural where Dutch is plural: the English "no cookie ... no tracker" is singular
  // twice, and following it word for word left the Dutch flipping mid-sentence.
  expect(dialog).toHaveTextContent(/geen account, geen inlog en er worden geen cookies geplaatst/i);
  expect(dialog).toHaveTextContent(/wat je apparaat verlaat/i);
  // The Dutch names the same recipient the English does, with the same host.
  expect(dialog).toHaveTextContent(/Photon op photon\.komoot\.io van komoot GmbH in Duitsland/i);
  // And the same two tile hosts as the English, fallback included.
  expect(dialog).toHaveTextContent("tiles.openfreemap.org");
  expect(dialog).toHaveTextContent("service.pdok.nl");

  // These four sentences were calques of the English and are now Dutch. Pinned because
  // a translation regresses the way copy does, quietly, on the next edit of the source
  // language: no resumptive "dat ziet", no fronted "Allebei zien ze", no "stuk kaart"
  // without its genitive, no passive "Aan geen van hen wordt gevraagd".
  expect(dialog).toHaveTextContent(/De app gebruikt geen analytics/i);
  expect(dialog).toHaveTextContent(/je IP-adres net als elke website die je opent/i);
  expect(dialog).toHaveTextContent(/Ze zien allebei welk stuk van de kaart je bekijkt/i);
  expect(dialog).toHaveTextContent(/Geen van hen krijgt te horen wie je bent/i);
  expect(dialog).not.toHaveTextContent(/dat ziet/i);
  expect(dialog).not.toHaveTextContent(/Aan geen van hen wordt gevraagd/i);
  expect(dialog).not.toHaveTextContent(/stuk kaart/i);

  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
});

// --- Skip link --------------------------------------------------------------------

test("the first tab stop is a skip link, and it points at the stage that is live", async () => {
  renderApp();
  // At rest the home owns the screen and the map stage is inert, so the link has to
  // aim at the home: sending focus into an inert subtree strands the keyboard user.
  const link = screen.getByRole("link", { name: /skip to main content/i });
  expect(document.body.firstElementChild?.querySelector("a")).toBe(link);
  expect(link).toHaveAttribute("href", "#fov-home-main");
  expect(document.querySelector("#fov-home-main")).toHaveAttribute("tabindex", "-1");

  // It is out of the way until it is focused, and it must come back when it is: with
  // focus:not-sr-only removed the link stays clipped to a 1px box for its whole life,
  // so a sighted keyboard user tabs onto a target they cannot see. Nothing else in the
  // suite notices, because sr-only on its own still reads as "present" to every query.
  expect(link).toHaveClass("sr-only", "focus:not-sr-only");
  // And it has to land somewhere on screen once it unhides: fixed, top left, above the
  // map chrome, at the 44px the rest of the mobile pass uses. The two offsets are read
  // rather than matched literally because they carry the device's safe-area insets —
  // 12px plus whatever the notch takes, which is 12px exactly wherever there is none —
  // but the check is the stronger one: an offset has to exist on both axes AND account
  // for the inset, so dropping either the distance or the env() term fails here.
  expect(link).toHaveClass("focus:fixed", "focus:z-[3000]");
  expect(link).toHaveClass("focus:min-h-[44px]");
  const classes = link.className.split(/\s+/);
  for (const [axis, inset] of [
    ["left", "safe-area-inset-left"],
    ["top", "safe-area-inset-top"],
  ]) {
    const offset = classes.find((c) => c.startsWith(`focus:${axis}-`));
    expect(offset).toBeDefined();
    expect(offset).toContain("0.75rem");
    expect(offset).toContain(`env(${inset})`);
  }
});

test("the results column credits Open-Meteo and OpenStreetMap, map hidden or not", async () => {
  renderApp();
  search();
  await planReady();

  const credit = screen.getByRole("note", { name: /^data sources$/i });
  expect(credit).toHaveTextContent(/Weather data by Open-Meteo/);
  // The advice on screen is still built from OpenStreetMap data and Open-Meteo's
  // forecast when the map is put away, so this credit has to survive that.
  fireEvent.click(screen.getByRole("button", { name: /hide map/i }));
  expect(screen.getByRole("note", { name: /^data sources$/i })).toHaveTextContent(
    /routes and places from OpenStreetMap data/,
  );
});
