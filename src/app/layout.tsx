import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kingdoms of the Forgotten Seas — Capítulo I",
  description:
    "Aventura medieval 3D de mundo abierto en tu navegador. Explora la isla de Aldmor, descubre ruinas antiguas, navega hacia lo desconocido y desentraña el legado de la Orden de la Marea.",
  keywords: [
    "videojuego 3D", "mundo abierto", "medieval", "Three.js", "aventura", "dragones",
    "Kingdoms of the Forgotten Seas", "Eldoria",
  ],
  authors: [{ name: "Estudio Marea" }],
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
    <html lang="es" suppressHydrationWarning>
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
