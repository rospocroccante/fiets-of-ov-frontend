import { fireEvent, render, screen, within } from "@testing-library/react";
import { vi } from "vitest";
import { I18nProvider } from "../lib/i18n";
import { ProfileScreen, type ProfileScreenProps } from "./ProfileScreen";

function renderProfile(over: Partial<ProfileScreenProps> = {}) {
  const props: ProfileScreenProps = {
    themeMode: "system",
    onThemeMode: vi.fn(),
    onClearRecents: vi.fn(),
    onClearSaved: vi.fn(),
    onOpenPrivacy: vi.fn(),
    ...over,
  };
  render(
    <I18nProvider>
      <ProfileScreen {...props} />
    </I18nProvider>,
  );
  return props;
}

test("theme is a three-way choice with the current one pressed", () => {
  const p = renderProfile({ themeMode: "dark" });
  const group = screen.getByRole("group", { name: "Theme" });
  expect(within(group).getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(within(group).getByRole("button", { name: "System" }));
  expect(p.onThemeMode).toHaveBeenCalledWith("system", expect.objectContaining({ x: expect.any(Number) }));
});

test("language switches to the other language and back", () => {
  renderProfile();
  const group = screen.getByRole("group", { name: "Language" });
  fireEvent.click(within(group).getByRole("button", { name: "Nederlands" }));
  expect(document.documentElement.lang).toBe("nl");
  expect(within(screen.getByRole("group", { name: "Language" })).getByRole("button", { name: "Nederlands" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("clearing local data asks twice", () => {
  const p = renderProfile();
  fireEvent.click(screen.getByRole("button", { name: "Clear saved places" }));
  expect(p.onClearSaved).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Tap again to clear" }));
  expect(p.onClearSaved).toHaveBeenCalledTimes(1);
});

test("privacy opens the notice; about and version are shown", () => {
  const p = renderProfile();
  fireEvent.click(screen.getByRole("button", { name: /privacy/i }));
  expect(p.onOpenPrivacy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("heading", { name: "About and sources" })).toBeInTheDocument();
  expect(screen.getByText(`Version ${__APP_VERSION__}`)).toBeInTheDocument();
});

test("every control is a 44px target", () => {
  renderProfile();
  for (const b of screen.getAllByRole("button")) expect(b).toHaveClass("min-h-[44px]");
});
