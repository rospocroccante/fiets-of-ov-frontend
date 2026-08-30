import { render, screen, fireEvent } from "@testing-library/react";
import { PrivacyNotice } from "./PrivacyNotice";
import { I18nProvider } from "../lib/i18n";

// aria-modal="true" tells assistive technology that the page behind the scrim does not
// exist for now. The markup declared it while Tab walked straight out of the dialog and
// into that page, which stays fully interactive underneath: focus landed on controls
// nobody could see, behind a blur, with no way back except Escape. These tests hold the
// declaration and the behaviour together, so the next person cannot keep one without
// the other.

function renderNotice() {
  const onClose = vi.fn();
  const view = render(
    <I18nProvider>
      <PrivacyNotice onClose={onClose} />
    </I18nProvider>,
  );
  return { ...view, onClose };
}

// Everything the trap is allowed to hand focus to, in document order.
function stops(): HTMLElement[] {
  const root = screen.getByRole("dialog").parentElement as HTMLElement;
  return Array.from(root.querySelectorAll<HTMLElement>('a[href], button, [tabindex="0"]'));
}

beforeEach(() => {
  window.localStorage.clear();
});

test("the dialog declares itself modal and opens with focus on Close", () => {
  renderNotice();
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog).toHaveAttribute("aria-labelledby");
  // Two controls carry that label: the scrim and the Close button, in that order.
  const closers = screen.getAllByRole("button", { name: /close the privacy notice/i });
  expect(document.activeElement).toBe(closers[closers.length - 1]);
});

test("Tab off the last control comes back to the first instead of leaving the dialog", () => {
  renderNotice();
  const items = stops();
  const first = items[0];
  const last = items[items.length - 1];
  expect(items.length).toBeGreaterThan(1);

  last.focus();
  fireEvent.keyDown(last, { key: "Tab" });
  expect(document.activeElement).toBe(first);
});

test("Shift+Tab off the first control goes to the last, not into the page behind", () => {
  renderNotice();
  const items = stops();
  const first = items[0];
  const last = items[items.length - 1];

  first.focus();
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(last);
});

test("focus that is already outside the dialog is pulled back in on the next Tab", () => {
  // The page behind the scrim: still in the document, still focusable, and exactly
  // where the old build sent a keyboard user on the first Tab.
  const behind = document.createElement("button");
  behind.textContent = "a control on the page behind";
  document.body.append(behind);
  renderNotice();

  behind.focus();
  expect(document.activeElement).toBe(behind);
  fireEvent.keyDown(behind, { key: "Tab" });
  expect(document.activeElement).toBe(stops()[0]);

  behind.remove();
});

test("Escape closes it, and Close closes it", () => {
  const { onClose } = renderNotice();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onClose).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getAllByRole("button", { name: /close the privacy notice/i })[0]);
  expect(onClose).toHaveBeenCalledTimes(2);
});
