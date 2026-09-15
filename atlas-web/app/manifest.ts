import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Atlas",
    short_name: "Atlas",
    description: "The life-admin assistant that asks before it acts.",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#f9f9fb",
    theme_color: "#3b82f6",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
    categories: ["productivity", "lifestyle"],
    shortcuts: [
      {
        name: "Inbox",
        url: "/inbox",
        description: "Open your Atlas inbox",
      },
      {
        name: "Add Garment",
        url: "/wardrobe/add",
        description: "Add a new garment",
      },
    ],
  };
}
