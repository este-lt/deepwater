"use client";

import { useState, useTransition } from "react";
import { calculerBiais, type Retour } from "@/app/actions";
import { DateLocale } from "@/components/horodatage";
import { useLangue } from "@/components/langue";

// Calcul manuel de la session visée (le calcul automatique tourne avant chaque session).
export function CommandesBiais() {
  const { t } = useLangue();
  const [retour, setRetour] = useState<Retour | null>(null);
  const [calcul, demarrerCalcul] = useTransition();

  const calculer = () =>
    demarrerCalcul(async () => {
      setRetour(await calculerBiais());
    });

  return (
    <div className="flex max-w-full flex-col items-start gap-1.5 sm:items-end">
      <button
        type="button"
        onClick={calculer}
        disabled={calcul}
        className="rounded-lg border border-accent/50 bg-accent-doux px-3.5 py-1.5 text-sm font-medium text-accent-clair transition-colors hover:border-accent disabled:animate-chargement"
      >
        {calcul ? t("Calcul en cours…", "Calculating…") : t("Calculer maintenant", "Calculate now")}
      </button>
      {retour && (
        <p role="status" className={`text-xs sm:text-right ${retour.ok ? "text-attenue" : "text-alerte"}`}>
          {retour.message}
          {retour.reessayerApres && (
            <>
              {" "}{t("Nouvel essai possible à", "Try again at")} <DateLocale iso={retour.reessayerApres} options={{ hour: "2-digit", minute: "2-digit" }} />.
            </>
          )}
        </p>
      )}
    </div>
  );
}
