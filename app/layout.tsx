import type { Metadata, Viewport } from "next";
import { Fredoka, Figtree } from "next/font/google";
import "@/app/globals.css";
import { AuthProvider } from "@/lib/firebase/AuthContext";
import AppShell from "@/components/AppShell";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "My Dashboard",
  description: "Local business dashboard",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "My Dashboard",
  },
  icons: {
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  // The installed app's own chrome (iOS status bar tint, Android task
  // switcher header) follows the page's theme-color, so a single dark value
  // left a black bar sitting above a cream page all day in light mode.
  // These are --cream's two values from globals.css — keep them in sync.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFCFA" },
    { media: "(prefers-color-scheme: dark)", color: "#15111C" },
  ],
  // Paired with appleWebApp.statusBarStyle "black-translucent" above: that
  // style lets the page draw under the status bar, which only looks right
  // if the viewport actually extends into the notch/home-indicator area and
  // the layout then insets itself back out (see #app-shell and
  // #floating-nav's env(safe-area-inset-*) in globals.css).
  viewportFit: "cover",
};

const SW_REGISTER_SCRIPT = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}
`;

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fredoka.variable} ${figtree.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SW_REGISTER_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
