import type { NextConfig } from "next";

/**
 * Fase 13 — GitHub Pages: `NEXT_OUTPUT=export NEXT_PUBLIC_BASE_PATH=/KFS npm
 * run build:pages` produce `out/` con el sitio 100% estático listo para la
 * rama main del repo (Pages lo sirve en axcgamestudios.github.io/KFS/).
 *
 * Sin esas variables el sandbox sigue con su flujo standalone de siempre.
 */
const isPages = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(isPages
    ? {
        output: "export" as const,
        basePath: "/KFS",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : { output: "standalone" }),
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
