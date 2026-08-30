import { render, screen, within } from "@testing-library/react";
import { AdviceAttribution } from "./Attribution";
import { I18nProvider } from "../lib/i18n";

// What these tests are really guarding is a licence condition, not a layout. Open-Meteo
// is CC BY 4.0 and wants a link "next to any location Open-Meteo data are displayed",
// and the ODbL is signalled by linking the word OpenStreetMap to
// openstreetmap.org/copyright. Both of those are assertable: the credit has to be in the
// tree on first render, and the link has to point at the copyright page rather than at
// the OSM home page.
//
// Being in the tree is not the obligation, though. Adding sr-only to the line hid it
// from every sighted user and left the whole suite green, so the class list is checked
// too. toBeVisible() cannot do this work here: Tailwind's classes are never compiled in
// jsdom, so nothing carries a computed style and everything looks visible.

function renderNl(ui: React.ReactElement) {
  window.localStorage.setItem("fov.lang.v1", "nl");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
});

test("the advice credit is drawn too, under the results column", () => {
  render(<AdviceAttribution />);
  const credit = screen.getByRole("note", { name: /data sources/i });
  expect(credit).not.toHaveClass("sr-only");
  expect(credit).not.toHaveClass("hidden");
  // Open-Meteo's CC BY 4.0 wants the link "next to any location Open-Meteo data are
  // displayed", so this one has to sit in the flow of the column rather than float.
  expect(credit).toHaveClass("mt-3", "px-1");
});

test("the advice credit carries the weather and the OpenStreetMap source", () => {
  render(<AdviceAttribution />);
  const credit = screen.getByRole("note", { name: /data sources/i });
  // Open-Meteo's CC BY 4.0 terms ask for a link next to where the data is shown.
  expect(within(credit).getByRole("link", { name: "Open-Meteo" })).toHaveAttribute(
    "href",
    "https://open-meteo.com/",
  );
  expect(within(credit).getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright",
  );
  expect(credit).toHaveTextContent(
    "Weather data by Open-Meteo, routes and places from OpenStreetMap data.",
  );
});

test("the credit is translated, and the link sits where Dutch word order puts it", () => {
  renderNl(<AdviceAttribution />);
  // "-gegevens" is a suffix on the linked name, not a separate word: the sentence has
  // to come from the string rather than from the JSX for this to be possible.
  const credit = screen.getByRole("note", { name: /gegevensbronnen/i });
  expect(credit).toHaveTextContent(
    "Weergegevens van Open-Meteo, routes en plekken uit OpenStreetMap-gegevens.",
  );
});
