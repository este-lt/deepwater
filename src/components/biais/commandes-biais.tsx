"use client";

import { useOptimistic, useState, useTransition } from "react";
import { basculerBiaisAuto, calculerBiais, type Retour } from "@/app/actions";
import { DateLocale } from "@/components/horodatage";

// Interrupteur personnel : le calcul automatique (global) tourne si au moins un
// utilisateur l'a activé. Le bouton manuel reste disponible dans tous les cas.
export function CommandesBiais({ autoActif }: { autoActif: boolean }) {
  const [enCours, demarrer] = useTransition();
  const [actif, setActifOptimiste] = useOptimistic(autoActif);
  const [retour, setRetour] = useState<Retour | null>(null);
  const [calcul, demarrerCalcul] = useTransition();

  const basculer = () =>
    demarrer(async () => {
      setActifOptimiste(!actif);
      setRetour(await basculerBiaisAuto(!actif));
    });

  const calculer = () =>
    demarrerCalcul(async () => {
      setRetour(await calculerBiais());
    });

  return (
    <div className="flex max-w-full flex-col items-start gap-1.5 sm:items-end">
      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={actif}
          disabled={enCours}
          onClick={basculer}
          className="group inline-flex items-center gap-2 text-sm text-attenue hover:text-texte disabled:opacity-60"
        >
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${actif ? "bg-accent" : "bg-surface-3"}`}
            aria-hidden
          >
            <span className={`size-4 rounded-full bg-white shadow transition-transform ${actif ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
          </span>
          Calcul automatique
        </button>
        <button
          type="button"
          onClick={calculer}
          disabled={calcul}
          className="rounded-lg border border-accent/50 bg-accent-doux px-3.5 py-1.5 text-sm font-medium text-accent-clair transition-colors hover:border-accent disabled:animate-chargement"
        >
          {calcul ? "Calcul en cours…" : "Calculer maintenant"}
        </button>
      </div>
      {retour && (
        <p role="status" className={`text-xs sm:text-right ${retour.ok ? "text-attenue" : "text-alerte"}`}>
          {retour.message}
          {retour.reessayerApres && (
            <>
              {" "}Nouvel essai possible à <DateLocale iso={retour.reessayerApres} options={{ hour: "2-digit", minute: "2-digit" }} />.
            </>
          )}
        </p>
      )}
    </div>
  );
}
