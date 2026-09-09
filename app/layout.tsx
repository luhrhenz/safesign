import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeSign — is this safe to sign?",
  description:
    "Paste a token address, contract address or link and find out if it is safe before you sign.",
  applicationName: "SafeSign",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // Installed from the home screen it runs fullscreen, like any other app.
  appleWebApp: { capable: true, title: "SafeSign", statusBarStyle: "default" },
  openGraph: {
    title: "SafeSign — is this safe to sign?",
    description: "Check a token, contract or link before you approve it.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches --ink / --paper. Colour in this app means safety status, so the
  // chrome stays neutral rather than borrowing a brand blue.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1113" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/*
          Registered inline rather than from a client component: it costs no
          hydration and no bundle weight, which matters more than tidiness on a
          cheap phone. Failure is silent — the app works without it.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}",
          }}
        />
      </body>
    </html>
  );
}
