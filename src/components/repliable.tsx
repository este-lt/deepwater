"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";

// Petit écran (< 768 px, ou fenêtre zoomée à 200 % sur un portable) : lu côté navigateur
// uniquement ; le serveur rend la version déployée (écran de portable d'abord).
const REQUETE = "(max-width: 767px)";
function abonner(rappel: () => void) {
  const mql = window.matchMedia(REQUETE);
  mql.addEventListener("change", rappel);
  return () => mql.removeEventListener("change", rappel);
}
const petitEcran = () => window.matchMedia(REQUETE).matches;

// Section secondaire : toujours dépliée sur grand écran, repliée en accordéon sur
// petit écran (l'utilisateur peut l'ouvrir d'un geste).
export function Repliable({ titre, resume, children }: { titre: string; resume?: string; children: ReactNode }) {
  const petit = useSyncExternalStore(abonner, petitEcran, () => false);
  const [ouvertParUtilisateur, setOuvertParUtilisateur] = useState(false);
  const ouvert = !petit || ouvertParUtilisateur;

  return (
    <details
      open={ouvert}
      onToggle={(e) => {
        if (petit) setOuvertParUtilisateur(e.currentTarget.open);
      }}
      className="group/repliable min-w-0"
    >
      <summary className="carte flex cursor-pointer list-none items-center justify-between gap-3 rounded-carte border border-bordure bg-surface px-5 py-4 md:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-[0.95rem] font-semibold tracking-tight">{titre}</span>
          {resume && <span className="block truncate text-xs text-attenue">{resume}</span>}
        </span>
        <span className="text-attenue transition-transform group-open/repliable:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <div className="mt-3 md:mt-0">{children}</div>
    </details>
  );
}
