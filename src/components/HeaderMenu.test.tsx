import { render, screen, fireEvent } from "@testing-library/react";
import { HeaderMenu } from "./HeaderMenu";
import { I18nProvider } from "../lib/i18n";

// HeaderMenu is the only place the language switch lives once the user is on the map
// stage, and it is meaningless without a provider: the default context's toggle is a
// deliberate no-op, so every test here mounts the real one.
function renderMenu(props: Partial<Parameters<typeof HeaderMenu>[0]> = {}) {
  const handlers = {
    onClearRecents: vi.fn(),
    onClearSaved: vi.fn(),
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
