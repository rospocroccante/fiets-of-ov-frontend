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
