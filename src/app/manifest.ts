import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UnseenPrompt",
    short_name: "UnseenPrompt",
    description:
      "Start with the messy version. Keep the decisions together and know what to ask for next.",
    start_url: "/",
    display: "standalone",
    background_color: "#FEFAF8",
    theme_color: "#FEFAF8",
    icons: [
      {
        src: "/brand/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
