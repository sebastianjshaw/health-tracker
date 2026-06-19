import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Baseline",
    short_name: "Baseline",
    description: "Track less, know more — a personal food, training and body-stats tracker.",
    start_url: "/",
    display: "standalone",
    background_color: "#0c0e12",
    theme_color: "#0c0e12",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
