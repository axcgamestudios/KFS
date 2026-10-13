import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kingdoms of the Forgotten Seas — Chapter 1: A Brand New Beginning",
  description:
    "A 3D medieval open-world adventure in your browser. Explore the island of Aldmor, uncover ancient ruins, sail into the unknown and unravel the legacy of the Order of the Tide.",
  keywords: [
    "3D video game", "open world", "medieval", "Three.js", "adventure", "dragons",
    "Kingdoms of the Forgotten Seas", "Eldoria",
  ],
  authors: [{ name: "AXCGames Studios" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0806",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Medieval typography — falls back gracefully to serif if offline */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-background text-foreground" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
