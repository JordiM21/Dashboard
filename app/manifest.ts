import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My Dashboard",
    short_name: "Dashboard",
    description: "LET Academy business dashboard",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    // A "maskable" icon is only used where the platform crops to its own
    // shape (Android). Without a 512 "any" entry the largest unmasked icon
    // was 192px, which Windows upscales for the Start menu tile and splash.
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
