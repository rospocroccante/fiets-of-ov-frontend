import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { I18nProvider } from "./lib/i18n";
import { morphTo, phoneViewport } from "./test/phone";

// The phone shell as one app: the tab bar, the Saved and Profile screens, and the Back
// button closing whatever is on top. Everything here runs on the phone path.
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

// A Back press: what the browser does when the user presses the phone's Back button.
async function pressBack() {
  await act(async () => {
    window.history.back();
    for (let k = 0; k < 6; k++) await new Promise((r) => setTimeout(r, 0));
  });
}

// Let the app's own history steps land, as they do in the milliseconds before a finger
// can reach the Back button. A tab switch back to Plan is a history.back() of the app's
// own, and the push queued behind it is applied when it lands; a pushState cancels any
// traversal still pending (jsdom follows the HTML spec rule), so a Back pressed in the
// same task as the tap would be dropped.
async function settle() {
  await act(async () => {
    for (let k = 0; k < 6; k++) await new Promise((r) => setTimeout(r, 0));
  });
}

let restore: () => void;
beforeEach(() => {
  restore = phoneViewport();
});
afterEach(() => {
  restore();
  // scrollY is the morph's only input and the suite runs in a random order: a test left
  // parked on the map would decide the next one's stage.
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

test("a phone gets the tab bar; the header menu and the home pills are gone", () => {
  renderApp();
  const bar = screen.getByRole("navigation", { name: "Sections" });
  expect(within(bar).getByRole("button", { name: "Plan" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("button", { name: /switch language|switch to dark|switch to light/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /^menu$/i })).toBeNull();
});

test("the Saved tab covers the stages, and Back returns to Plan", async () => {
  window.localStorage.setItem(
    "fov.savedPlaces.v1",
    JSON.stringify([{ id: "52.3660,4.9166", name: "Artis", label: "Artis", lat: 52.366, lon: 4.9166, savedAt: 1 }]),
  );
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Saved" }));
  const saved = document.querySelector('[data-fov="saved-screen"]') as HTMLElement;
  expect(saved).not.toHaveAttribute("inert");
  expect(document.querySelector('[data-fov="home-stage"]')).toHaveAttribute("inert");
  expect(within(saved).getByRole("button", { name: /Artis/ })).toBeInTheDocument();
  await pressBack();
  expect(saved).toHaveAttribute("inert");
  expect(screen.getByRole("button", { name: "Plan" })).toHaveAttribute("aria-current", "page");
});

test("Back closes the phone search screen", async () => {
  renderApp();
  fireEvent.click(document.querySelector('[data-fov="search-entry"]') as HTMLElement);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await pressBack();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("Back on the map stage goes home and keeps the trip", async () => {
  renderApp();
  fireEvent.click(screen.getAllByRole("button", { name: /Amsterdam Centraal/ })[0]);
  await morphTo(1);
  await pressBack();
  expect(window.scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ top: 0 }));
  expect((document.querySelector('[data-fov="search-entry"]') as HTMLElement).textContent).toMatch(/Vondelpark/);
});

test("a saved place with no start opens search with the destination filled", async () => {
  window.localStorage.setItem(
    "fov.savedPlaces.v1",
    JSON.stringify([{ id: "52.3660,4.9166", name: "Artis", label: "Artis", lat: 52.366, lon: 4.9166, savedAt: 1 }]),
  );
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Saved" }));
  fireEvent.click(within(document.querySelector('[data-fov="saved-screen"]') as HTMLElement).getByRole("button", { name: /Artis/ }));
  const dialog = await screen.findByRole("dialog");
  await settle();
  expect(within(dialog).getByDisplayValue("Artis")).toBeInTheDocument();
  // The tab bar slides away (aria-hidden) behind the open search screen, hence `hidden`.
  expect(screen.getByRole("button", { name: "Plan", hidden: true })).toHaveAttribute("aria-current", "page");
  // The search screen's entry sits above the Plan entry, so one Back closes it.
  await pressBack();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("Profile holds the theme, and System is the first-visit choice", () => {
  renderApp();
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  const group = within(document.querySelector('[data-fov="profile-screen"]') as HTMLElement).getByRole("group", {
    name: "Theme",
  });
  expect(within(group).getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
});
