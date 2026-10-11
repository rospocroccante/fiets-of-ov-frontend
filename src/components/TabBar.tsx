import { motion } from "framer-motion";
import type { Tab } from "../hooks/useAppNav";
import { useI18n } from "../lib/i18n";
import { DURATION, EASE } from "../lib/motion";
import { TabIcon } from "./icons/TabIcons";

// The phone's three sections. Mounted outside both morph stages (one of them is always
// inert), fixed to the bottom edge above the safe area. It slides away while the map
// stage, the search sheet or navigation owns the screen.
export const TAB_BAR_PX = 56;
export const TAB_BAR_COMPACT_PX = 44;

const TABS = [
  { id: "plan", label: "tabPlan" },
  { id: "saved", label: "tabSaved" },
  { id: "profile", label: "tabProfile" },
] as const;

export function TabBar({
  tab,
  onSelect,
  hidden,
  compact,
}: {
  tab: Tab;
  onSelect: (tab: Tab) => void;
  hidden: boolean;
  compact: boolean;
}) {
  const { t } = useI18n();
  return (
    <motion.nav
      data-fov="tab-bar"
      aria-label={t("tabsLabel")}
      initial={false}
      animate={{ y: hidden ? "110%" : "0%" }}
      transition={{ duration: DURATION.base, ease: hidden ? EASE.exit : EASE.enter }}
      className="fixed inset-x-0 bottom-0 z-[1800] border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur-md dark:border-night-rim/30 dark:bg-night-surface/70"
      {...(hidden ? { inert: "" as const, "aria-hidden": true as const } : {})}
    >
      <ul className={`flex ${compact ? "h-11" : "h-14"}`}>
        {TABS.map(({ id, label }) => {
          const active = id === tab;
          return (
            <li key={id} className="flex flex-1">
              <button
                type="button"
                data-fov={`tab-${id}`}
                aria-current={active ? "page" : undefined}
                aria-label={compact ? t(label) : undefined}
                onClick={() => onSelect(id)}
                className={`flex min-h-[44px] flex-1 items-center justify-center text-[11px] font-semibold transition-colors ${
                  compact ? "" : "flex-col gap-0.5"
                } ${active ? "text-brand dark:text-night-accent" : "text-slate-500 dark:text-night-subtle"}`}
              >
                <span className="relative flex h-7 w-14 items-center justify-center">
                  {active && (
                    <motion.span
                      layoutId="tab-pill"
                      aria-hidden="true"
                      className="absolute inset-0 rounded-full bg-brand-light dark:bg-night-raised"
                      transition={{ duration: DURATION.base, ease: EASE.enter }}
                    />
                  )}
                  <TabIcon tab={id} active={active} className="relative h-6 w-6" />
                </span>
                {!compact && <span>{t(label)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </motion.nav>
  );
}
