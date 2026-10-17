import type { MetadataRoute } from "next";

// Application web : sur iPhone, Safari > Partager > « Sur l'écran d'accueil » ouvre
// Deepwater en plein écran, sans barre d'adresse.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Deepwater",
    short_name: "Deepwater",
    description: "Terminal de marché gratuit / Free market terminal",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    icons: [{ src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
