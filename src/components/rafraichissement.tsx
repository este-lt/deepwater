"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Relit les données du serveur à intervalle régulier (fil instantané, crypto), seulement
// quand l'onglet est visible ; aucun appel externe : le serveur lit la base.
export function RafraichissementAuto({ minutes }: { minutes: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, minutes * 60_000);
    return () => clearInterval(id);
  }, [router, minutes]);
  return null;
}
