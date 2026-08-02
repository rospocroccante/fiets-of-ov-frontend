import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
