import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { HeaderMenu } from "./HeaderMenu";
import { I18nProvider } from "../lib/i18n";

// HeaderMenu is the only place the language switch lives once the user is on the map
// stage, and it is meaningless without a provider: the default context's toggle is a
// deliberate no-op, so every test here mounts the real one.
function renderMenu(props: Partial<Parameters<typeof HeaderMenu>[0]> = {}) {
  const handlers = {
    onClearRecents: vi.fn(),
    onClearSaved: vi.fn(),
    onOpenPrivacy: vi.fn(),
    dark: false,
    onToggleTheme: vi.fn(),
    ...props,
  };
  render(
    <I18nProvider>
      <HeaderMenu {...handlers} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /^menu/i }));
  return handlers;
}

beforeEach(() => {
  window.localStorage.clear();
});

test("the language row is named in the language it switches TO", () => {
  renderMenu();
  // English UI: the row offers Dutch, in Dutch.
  expect(screen.getByRole("button", { name: "Nederlands" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "English" })).toBeNull();
});

test("a Dutch UI offers the row in English, not in Dutch", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  renderMenu();
  expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nederlands" })).toBeNull();
  // The rest of the menu is Dutch, which is what makes the English row legible.
  expect(screen.getByRole("button", { name: /wis recente zoekopdrachten/i })).toBeInTheDocument();
});

test("clicking the language row flips the menu's own strings and keeps it open", () => {
  renderMenu();
  expect(screen.getByRole("button", { name: /dark mode/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Nederlands" }));

  // Menu still open (that is the point: the flip has to be visible), now in Dutch.
  expect(screen.getByRole("button", { name: /donkere modus/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "English" })).toBeInTheDocument();
  expect(window.localStorage.getItem("fov.lang.v1")).toBe("nl");
});

test("the theme row names the theme it switches to and delegates to the parent", () => {
  const { onToggleTheme } = renderMenu({ dark: true });
  const row = screen.getByRole("button", { name: /light mode/i });
  expect(row).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(row);
  expect(onToggleTheme).toHaveBeenCalledTimes(1);
});

test("the clear rows call their handler and close the menu", () => {
  const { onClearRecents } = renderMenu();
  fireEvent.click(screen.getByRole("button", { name: /clear recent searches/i }));
  expect(onClearRecents).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /clear saved places/i })).toBeNull();
});

test("Escape closes the menu and hands focus back to the button that opened it", () => {
  renderMenu();
  expect(screen.getByRole("button", { name: /clear saved places/i })).toBeInTheDocument();

  fireEvent.keyDown(window, { key: "Escape" });

  expect(screen.queryByRole("button", { name: /clear saved places/i })).toBeNull();
  // Focus must not be left on a button that no longer exists, or the next Tab starts
  // from the top of the document.
  expect(screen.getByRole("button", { name: /^menu/i })).toHaveFocus();
});

test("the row that closes the menu on a tap outside comes last, and gives focus back", () => {
  renderMenu();
  // The scrim is a real button with a name, so a screen reader has a way out too. It
  // used to be the FIRST child of the open menu, which put a full-screen invisible
  // button ahead of every row in the tab order.
  const nav = screen.getByRole("navigation");
  const stops = Array.from(nav.querySelectorAll("button"));
  expect(stops[stops.length - 1]).toHaveAccessibleName(/close menu/i);

  fireEvent.click(screen.getByRole("button", { name: /close menu/i }));

  expect(screen.queryByRole("button", { name: /clear saved places/i })).toBeNull();
  expect(screen.getByRole("button", { name: /^menu/i })).toHaveFocus();
});

test("every row that closes the menu hands focus back to the trigger", () => {
  // A row that closes the menu unmounts the element focus was on, and focus falls to
  // the body: the next Tab then starts again from the top of the document. Escape was
  // the only path that used to return it.
  for (const name of [/clear recent searches/i, /clear saved places/i, /^privacy$/i]) {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name }));
    expect(screen.getByRole("button", { name: /^menu/i })).toHaveFocus();
    cleanup();
  }
});

test("Tab is trapped inside the open menu", () => {
  renderMenu();
  const trigger = screen.getByRole("button", { name: /^menu/i });
  const nav = screen.getByRole("navigation");
  const stops = Array.from(nav.querySelectorAll("button")).filter((b) => b !== trigger);

  // From the trigger, forwards: into the first row rather than past the panel. jsdom
  // does not move focus on Tab by itself, so what is asserted is the handler's own
  // decision — which is the whole mechanism, since the browser's default is exactly
  // what walked out of the menu and onto the search pill behind it.
  trigger.focus();
  fireEvent.keyDown(window, { key: "Tab" });
  expect(stops[0]).toHaveFocus();

  // From the last stop, forwards: back to the first.
  stops[stops.length - 1].focus();
  fireEvent.keyDown(window, { key: "Tab" });
  expect(stops[0]).toHaveFocus();

  // From the first stop, backwards: round to the last.
  stops[0].focus();
  fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
  expect(stops[stops.length - 1]).toHaveFocus();
});

test("a key other than Escape leaves the menu open", () => {
  renderMenu();
  fireEvent.keyDown(window, { key: "a" });
  expect(screen.getByRole("button", { name: /clear saved places/i })).toBeInTheDocument();
});

test("the trigger reports its expanded state, and every row is a 44px touch target", () => {
  renderMenu();
  const trigger = screen.getByRole("button", { name: /^menu/i });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  for (const name of [/dark mode/i, "Nederlands", /clear recent searches/i, /clear saved places/i]) {
    expect(screen.getByRole("button", { name })).toHaveClass("min-h-[44px]");
  }
  expect(trigger).toHaveClass("min-h-[44px]");
});

test("the privacy row opens the notice and closes the menu", () => {
  const { onOpenPrivacy } = renderMenu();
  const row = screen.getByRole("button", { name: /^privacy$/i });
  expect(row).toHaveClass("min-h-[44px]");
  fireEvent.click(row);
  expect(onOpenPrivacy).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: /^privacy$/i })).toBeNull();
});

test("the about block names every source the app actually calls, Photon included", () => {
  renderMenu();
  // This block is where the map's own sources are named, and the only place the
  // geocoder, the POI source and the autocomplete are named at all. Photon is the one
  // that sees typed input rather than a finished coordinate (api/client.ts,
  // searchPlaces), so it is named with its host.
  const about = screen.getByText(/rain-aware bike vs transit advice/i);
  for (const source of [
    "OpenTripPlanner",
    "OpenStreetMap",
    "OpenFreeMap",
    "OpenMapTiles",
    "Photon",
    "photon.komoot.io",
    "Nominatim",
    "Overpass",
    "RainViewer",
    "Open-Meteo",
  ]) {
    expect(about).toHaveTextContent(source);
  }
});

// The fallback basemap is a source the app really calls, on a machine with WebGL
// disabled or a blacklisted GPU: PDOK serves the Kadaster's BRT-Achtergrondkaart as
// raster tiles (components/Basemap, BASEMAP_FALLBACK). It is open data with a credit
// obligation of its own, and it was uncredited until this test existed. Both languages,
// because a credit that survives in one is still missing in the other.
test.each([
  ["en", /rain-aware bike vs transit advice/i],
  ["nl", /regenbewust fiets-of-OV-advies/i],
])("the about block credits the no-WebGL fallback basemap (%s)", (lang, opening) => {
  window.localStorage.setItem("fov.lang.v1", lang);
  renderMenu();
  const about = screen.getByText(opening);
  expect(about).toHaveTextContent("PDOK");
  expect(about).toHaveTextContent("service.pdok.nl");
  expect(about).toHaveTextContent(/Kadaster/i);
  expect(about).toHaveTextContent(/BRT-Achtergrondkaart/i);
  // Named as the fallback it is, not as the map everyone gets.
  expect(about).toHaveTextContent(/WebGL/i);
});

test("the Dutch about block is Dutch, not a word-for-word copy of the English", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  renderMenu();
  const about = screen.getByText(/regenbewust fiets-of-OV-advies/i);
  expect(about).toHaveTextContent("Photon");
  expect(about).toHaveTextContent("photon.komoot.io");
  // "kaartprikken" was an invented compound. Dutch says it with a verb.
  expect(about).toHaveTextContent(/adressen bij het prikken op de kaart/i);
  expect(about).not.toHaveTextContent(/kaartprikken/i);
});
