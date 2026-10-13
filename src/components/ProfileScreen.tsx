import type { ReactNode } from "react";
import { useConfirmTap } from "../hooks/useConfirmTap";
import { centreOf, type RevealOrigin, type ThemeMode } from "../hooks/useTheme";
import { useI18n, type Lang } from "../lib/i18n";

export interface ProfileScreenProps {
  themeMode: ThemeMode;
  onThemeMode: (mode: ThemeMode, origin?: RevealOrigin) => void;
  onClearRecents: () => void;
  onClearSaved: () => void;
  onOpenPrivacy: () => void;
}

// The Profile tab. Without an account (sub-project 2) it holds what the header menu held
// on the phone: theme, language, local data, privacy, and the about block that names the
// sources.
export function ProfileScreen({ themeMode, onThemeMode, onClearRecents, onClearSaved, onOpenPrivacy }: ProfileScreenProps) {
  const { t, lang, toggle } = useI18n();
  const clearRecents = useConfirmTap(onClearRecents);
  const clearSaved = useConfirmTap(onClearSaved);
  const row =
    "flex min-h-[44px] w-full items-center justify-between px-4 py-3 text-left text-[15px] text-slate-900 transition-colors hover:bg-slate-50 dark:text-night-text dark:hover:bg-night-hover";
  return (
    <div className="px-6 pb-6 pt-[calc(1rem+env(safe-area-inset-top))]">
      <h1 className="flex min-h-[44px] items-center text-[28px] font-bold leading-tight text-slate-900 dark:text-night-text">
        {t("tabProfile")}
      </h1>

      <Group title={t("themeHeading")}>
        <Segmented
          label={t("themeHeading")}
          value={themeMode}
          options={[
            ["light", t("themeLight")],
            ["dark", t("themeDark")],
            ["system", t("themeSystem")],
          ]}
          onChange={(mode, el) => onThemeMode(mode, centreOf(el))}
        />
      </Group>

      <Group title={t("languageHeading")}>
        <Segmented<Lang>
          label={t("languageHeading")}
          value={lang}
          options={[
            ["en", "English"],
            ["nl", "Nederlands"],
          ]}
          onChange={(next) => {
            if (next !== lang) toggle();
          }}
        />
      </Group>

      <Group title={t("dataOnDevice")}>
        <div className="divide-y divide-slate-100 overflow-hidden rounded-card border border-slate-200 dark:divide-night-border dark:border-night-border">
          <button type="button" className={row} onClick={clearRecents.tap}>
            {clearRecents.armed ? t("tapAgainToClear") : t("clearRecentSearches")}
          </button>
          <button type="button" className={row} onClick={clearSaved.tap}>
            {clearSaved.armed ? t("tapAgainToClear") : t("clearSavedPlaces")}
          </button>
        </div>
      </Group>

      <div className="mt-6 overflow-hidden rounded-card border border-slate-200 dark:border-night-border">
        <button type="button" className={row} onClick={onOpenPrivacy}>
          {t("privacy")}
          <Chevron />
        </button>
      </div>

      <section aria-labelledby="profile-about-heading" className="mt-8">
        <h2 id="profile-about-heading" className="text-[17px] font-semibold text-slate-900 dark:text-night-text">
          {t("aboutHeading")}
        </h2>
        <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-night-text">Fiets of OV</p>
        <p className="mt-1 text-[13px] leading-snug text-slate-600 dark:text-night-subtle">{t("aboutText")}</p>
      </section>

      <p className="mt-8 text-center text-xs text-slate-500 dark:text-night-subtle">{t("versionX", { x: __APP_VERSION__ })}</p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-night-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T, el: HTMLElement) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 rounded-full bg-slate-100 p-1 dark:bg-night-raised">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={(e) => onChange(v, e.currentTarget)}
          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
            v === value
              ? "bg-white text-slate-900 shadow-sm dark:bg-night-hover dark:text-night-text"
              : "text-slate-600 dark:text-night-muted"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Chevron() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 text-slate-400 dark:text-night-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
