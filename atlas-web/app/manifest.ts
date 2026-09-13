import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas — the quiet map of your next move",
    short_name: "Atlas",
    description:
      "Atlas notices the work you are avoiding, prepares the next move, and asks before it acts.",
    start_url: "/inbox",
    scope: "/",
    display: "standalone",
    background_color: "#f5f2ea",
    theme_color: "#17191e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
