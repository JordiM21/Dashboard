export interface NavTab {
  id: string;
  href: string;
  label: string;
  icon: string;
}

export const ALL_NAV_TABS: NavTab[] = [
  { id: "overview", href: "/overview", label: "Overview", icon: "🏠" },
  { id: "students", href: "/students", label: "Students", icon: "🎓" },
  { id: "teaching", href: "/teaching", label: "Teaching", icon: "🖍️" },
  { id: "finance", href: "/finance", label: "Finance", icon: "💰" },
  { id: "kommo", href: "/kommo", label: "Kommo", icon: "📈" },
  { id: "meta", href: "/meta", label: "Meta", icon: "📣" },
  { id: "projects", href: "/projects", label: "Projects", icon: "🗂️" },
  { id: "resources", href: "/resources", label: "Resources", icon: "📁" },
  { id: "content", href: "/content", label: "Content", icon: "🖼️" },
  { id: "agents", href: "/agents", label: "Agents", icon: "🤖" },
];

export const DEFAULT_VISIBLE_TAB_IDS = ALL_NAV_TABS.map((t) => t.id);

export const NAV_STORAGE_KEY = "nav-visible-tabs";
