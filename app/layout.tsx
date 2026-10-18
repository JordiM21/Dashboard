import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Bricolage_Grotesque } from "next/font/google";
import "@/app/globals.css";
import { AuthProvider } from "@/lib/firebase/AuthContext";
import { LiveProvider } from "@/lib/hub/live";
import Gate from "@/components/hub/Gate";

// Geist preloads; Bricolage is display-only and may arrive after first paint (§11).
const bricolage = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], weight: ["700"], variable: "--font-display", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Hub",
  description: "Personal operating system",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Hub" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B0F" },
  ],
};

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
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} ${bricolage.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AuthProvider>
          <LiveProvider>
            <Gate>{children}</Gate>
          </LiveProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
