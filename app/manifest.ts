import type { MetadataRoute } from "next";

/**
 * Makes SafeSign installable: "Add to home screen" gives it its own icon and
 * opens without browser chrome, which is what most people mean by "an app".
 *
 * `display: standalone` matters more here than it looks. A user who reaches a
 * safety tool through a browser tab, next to the tab that is trying to rob
 * them, is one swipe from confusing the two.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SafeSign — is this safe to sign?",
    short_name: "SafeSign",
    description:
      "Check a token, contract or link before you approve it. Built for MiniPay users.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f6f8",
    theme_color: "#14171a",
    categories: ["finance", "security", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
