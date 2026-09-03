export interface NavTab {
  id: string;
  href: string;
  label: string;
  icon: string;
}

export const ALL_NAV_TABS: NavTab[] = [
  { id: "overview", href: "/overview", label: "Overview", icon: "🏠" },
  // Students and Teaching are one view now. The tab id stays "students" so
  // a nav layout already saved in localStorage keeps resolving to it.
  { id: "students", href: "/students", label: "Classroom", icon: "🎓" },
  { id: "finance", href: "/finance", label: "Finance", icon: "💰" },
  { id: "kommo", href: "/kommo", label: "Kommo", icon: "📈" },
  { id: "meta", href: "/meta", label: "Meta", icon: "📣" },
  // Tab id stays "projects" even though this is the Tasks view now — the
  // id is what a saved nav layout in localStorage refers to, so renaming
  // it would quietly drop the tab for anyone who has customized theirs.
  { id: "projects", href: "/tasks", label: "Tasks", icon: "✅" },
];

export const DEFAULT_VISIBLE_TAB_IDS = ALL_NAV_TABS.map((t) => t.id);

export const NAV_STORAGE_KEY = "nav-visible-tabs";
