import { render, screen, fireEvent } from "@testing-library/react";
import { I18nProvider, translate, useI18n } from "./i18n";

function Probe() {
  const { lang, t, toggle } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="popular">{t("popularTrips")}</span>
      <span data-testid="count">{t("routesInArea", { n: 3 })}</span>
      <button onClick={toggle}>switch</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

test("without a provider the default context is working English with a no-op toggle", () => {
  render(<Probe />);
  expect(screen.getByTestId("lang")).toHaveTextContent(/^en$/);
  expect(screen.getByTestId("popular")).toHaveTextContent("Popular trips");
  fireEvent.click(screen.getByRole("button", { name: "switch" }));
  expect(screen.getByTestId("lang")).toHaveTextContent(/^en$/);
  expect(screen.getByTestId("popular")).toHaveTextContent("Popular trips");
});

test("toggle switches every string to Dutch and back", () => {
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
  expect(screen.getByTestId("popular")).toHaveTextContent("Popular trips");
  fireEvent.click(screen.getByRole("button", { name: "switch" }));
  expect(screen.getByTestId("lang")).toHaveTextContent(/^nl$/);
  expect(screen.getByTestId("popular")).toHaveTextContent("Populaire ritten");
  expect(screen.getByTestId("count")).toHaveTextContent("3 routes in beeld");
  fireEvent.click(screen.getByRole("button", { name: "switch" }));
  expect(screen.getByTestId("popular")).toHaveTextContent("Popular trips");
});

test("initial language comes from localStorage and changes persist", () => {
  window.localStorage.setItem("fov.lang.v1", "nl");
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
  expect(screen.getByTestId("lang")).toHaveTextContent(/^nl$/);
  fireEvent.click(screen.getByRole("button", { name: "switch" }));
  expect(window.localStorage.getItem("fov.lang.v1")).toBe("en");
});

test("t substitutes {name} placeholders from the params object", () => {
  expect(translate("en", "routesInArea", { n: 3 })).toBe("3 routes in area");
  expect(translate("nl", "routesInArea", { n: 3 })).toBe("3 routes in beeld");
  expect(translate("nl", "toX", { x: "NDSM" })).toBe("naar NDSM");
  expect(translate("en", "leaveAtT", { t: "14:32" })).toBe("Leave at 14:32");
});

test("the document's lang attribute follows the switch, not just the strings", () => {
  document.documentElement.lang = "";
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
  // index.html ships lang="nl"; the provider owns the attribute from mount onwards, so
  // an English session says so to screen readers and translation tools.
  expect(document.documentElement).toHaveAttribute("lang", "en");
  fireEvent.click(screen.getByRole("button", { name: "switch" }));
  expect(document.documentElement).toHaveAttribute("lang", "nl");
  fireEvent.click(screen.getByRole("button", { name: "switch" }));
  expect(document.documentElement).toHaveAttribute("lang", "en");
});

test("a stored Dutch preference sets the document language on the very first render", () => {
  document.documentElement.lang = "";
  window.localStorage.setItem("fov.lang.v1", "nl");
  render(
    <I18nProvider>
      <Probe />
    </I18nProvider>,
  );
  expect(document.documentElement).toHaveAttribute("lang", "nl");
});

test("the navigation shell's strings exist and fill their placeholders", () => {
  expect(translate("en", "tabSaved")).toBe("Saved");
  expect(translate("en", "deleteX", { x: "Artis" })).toBe("Delete Artis");
  expect(translate("en", "versionX", { x: "0.1.0" })).toBe("Version 0.1.0");
  // The Dutch lines are the owner's, and fill the same placeholders.
  expect(translate("nl", "tabProfile")).toBe("Profiel");
  expect(translate("nl", "deleteX", { x: "Artis" })).toBe("Verwijder Artis");
  expect(translate("nl", "deletedX", { x: "Artis" })).toBe("Artis verwijderd");
  expect(translate("nl", "versionX", { x: "0.1.0" })).toBe("Versie 0.1.0");
});

test("the phone sheet's summary strings have their vetted Dutch", () => {
  expect(translate("en", "planningTrip")).toBe("Planning your trip…");
  expect(translate("en", "routesUnavailable")).toBe("Routes are unavailable right now. Try again in a moment.");
  expect(translate("en", "tryAgain")).toBe("Try again");
  expect(translate("nl", "planningTrip")).toBe("Je rit wordt gepland…");
  expect(translate("nl", "routesUnavailable")).toBe("Routes zijn nu niet beschikbaar. Probeer het zo opnieuw.");
  expect(translate("nl", "tryAgain")).toBe("Opnieuw proberen");
});

test("a popular or recent trip names its origin with a parameterized from line", () => {
  expect(translate("en", "fromX", { x: "Zuid" })).toBe("from Zuid");
  expect(translate("nl", "fromX", { x: "Zuid" })).toBe("vanaf Zuid");
});

// Every string added for the phone shell had English in both languages until the
// owner vetted the Dutch. None of them may fall back to the English line now.
test("no phone-shell string is still English in Dutch", () => {
  const keys = [
    "tabsLabel", "tabPlan", "tabSaved", "tabProfile", "savedPlacesHeading", "savedEmpty", "searchForPlace",
    "edit", "done", "deleteX", "deleteLabel", "deletedX", "undo", "clearAll", "tapAgainToClear", "seeAll",
    "themeHeading", "themeLight", "themeDark", "themeSystem", "languageHeading", "dataOnDevice", "aboutHeading",
    "versionX", "expandResults", "collapseResults", "resultsSheetLabel", "planningTrip", "routesUnavailable",
    "tryAgain", "privacyStaysClear",
  ] as const;
  const english = keys.filter((k) => translate("nl", k, { x: "X" }) === translate("en", k, { x: "X" }));
  expect(english).toEqual([]);
  expect(translate("nl", "privacyStaysClear")).toContain("onder Profiel");
});
