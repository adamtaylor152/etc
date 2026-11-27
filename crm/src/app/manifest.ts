import type { MetadataRoute } from "next";

// "Add to Home Screen" for the crew: opens straight to Today, full screen, navy.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "etc. CRM",
    short_name: "etc.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef2f8",
    theme_color: "#14213d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
