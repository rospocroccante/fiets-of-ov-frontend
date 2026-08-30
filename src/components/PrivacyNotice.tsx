import { useEffect, useRef } from "react";
import { useI18n } from "../lib/i18n";

// The privacy notice, as a modal dialog rather than a page: the app has no router, and
// a notice that opens over whichever stage you are on is reachable from both the home
// and the map without either of them growing a footer.
//
// The text is in i18n.tsx and every claim in it is checked against the code. Two lines
// carry a PLACEHOLDER that only the owner of the service can fill in (the controller's
// identity and contact, where the planner is hosted, and the date the notice last
// changed); they are deliberately loud so they cannot be shipped by accident.
// Everything a Tab press is allowed to reach while the notice is up. The notice itself
// has no form controls, so in practice this is the scrim and the Close button, but the
// query is written against roles rather than against today's markup.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function PrivacyNotice({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Focus lands on Close: with the dialog open over an inert stage there is nothing
  // else sensible to start from, and Escape closes it the way the header menu does.
  //
  // Tab is caught at the two ends and wrapped. aria-modal="true" is a promise to a
  // screen-reader user that the page behind the scrim is not there; without the wrap
  // the first Tab past Close walked straight into that page, which is still fully
  // interactive underneath, and the promise was false. Only the boundaries are
  // intercepted, so ordinary movement inside the dialog stays the browser's.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = rootRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // A focus that has already escaped (or never entered) is pulled back in too:
      // otherwise Tab from outside the dialog keeps travelling through the page.
      if (!(active instanceof HTMLElement) || !root.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const heading = "fov-privacy-title";
  const section = "mt-5 text-sm font-semibold text-slate-900 dark:text-night-text";
  const body = "mt-2 text-sm leading-relaxed text-slate-600 dark:text-night-muted";

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[2000] flex items-end justify-center p-0 sm:items-center sm:p-6"
    >
      {/* The scrim closes on click, and is a button so a keyboard user reaching it by
          Tab can do the same; Escape is the shortcut. */}
      <button
        type="button"
        aria-label={t("closePrivacy")}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        // max-h + its own scroller: at 360x640 this text is well past one screen, and
        // the page behind it cannot be scrolled while the dialog is up.
        className="relative max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-t-card bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-xl dark:bg-night-raised sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={heading} className="text-lg font-bold text-slate-900 dark:text-night-text">
            {t("privacy")}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={t("closePrivacy")}
            onClick={onClose}
            className="-mr-2 -mt-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-night-subtle dark:hover:bg-night-hover"
          >
            <span aria-hidden="true" className="material-symbols-rounded text-[20px] leading-none">
              close
            </span>
          </button>
        </div>

        <p className={body}>{t("privacyIntro")}</p>

        <h3 className={section}>{t("privacyLeavesTitle")}</h3>
        <p className={body}>{t("privacyLeavesRouting")}</p>
        <p className={body}>{t("privacyLeavesSearch")}</p>
        <p className={body}>{t("privacyLeavesGeocoding")}</p>
        <p className={body}>{t("privacyLeavesMap")}</p>
        <p className={body}>{t("privacyLeavesWeather")}</p>
        <p className={body}>{t("privacyLeavesIp")}</p>

        <h3 className={section}>{t("privacyStaysTitle")}</h3>
        <p className={body}>{t("privacyStaysWhat")}</p>
        <p className={body}>{t("privacyStaysClear")}</p>

        <h3 className={section}>{t("privacyContactTitle")}</h3>
        <p className={body}>{t("privacyContact")}</p>
        <p className={`${body} text-slate-500 dark:text-night-subtle`}>{t("privacyUpdated")}</p>
      </div>
    </div>
  );
}
