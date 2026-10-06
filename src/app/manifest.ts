import type { MetadataRoute } from "next";

/** Lets people install Plotline as an app (Community › Install app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plotline",
    short_name: "Plotline",
    description: "Plan, create, approve, publish and grow social media from one workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f0",
    theme_color: "#1c1d21",
    icons: [
      { src: "/icons/plotline-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/plotline-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/plotline-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
