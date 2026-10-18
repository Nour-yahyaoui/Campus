import type { MetadataRoute } from "next";
import { PRODUCT } from "@campussphere/contracts";

/**
 * Web app manifest. Making the site installable matters more than it sounds on
 * a campus network: students add it to the home screen once and open it like an
 * app, which also makes it eligible for richer search presentation.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT.name,
    short_name: "CampusSphere",
    description: PRODUCT.description,
    lang: "en",
    dir: "ltr",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f6f2e9",
    theme_color: "#24503c",
    categories: ["education", "social", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "Clubs", short_name: "Clubs", url: "/clubs" },
      { name: "Events", short_name: "Events", url: "/events" },
      { name: "Projects", short_name: "Projects", url: "/projects" },
      { name: "Search", short_name: "Search", url: "/search" },
    ],
  };
}
