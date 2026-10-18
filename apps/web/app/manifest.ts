import type { MetadataRoute } from "next";
import { PRODUCT } from "@campussphere/contracts";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT.name,
    short_name: "CampusSphere",
    description: PRODUCT.description,
    start_url: "/",
    display: "standalone",
    background_color: "#f6f2e9",
    theme_color: "#24503c",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
