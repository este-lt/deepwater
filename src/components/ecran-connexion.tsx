import type { ReactNode } from "react";
import { traducteur } from "@/lib/i18n";
import { lirePreferences } from "@/lib/preferences";
import { Logo } from "./logo";

export async function EcranConnexion({ children }: { children: ReactNode }) {
  const t = traducteur((await lirePreferences()).langue);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center animate-apparition">
        <Logo taille="grand" />
        <p className="max-w-sm text-sm text-attenue">
          {t(
            "Terminal de marché gratuit : indices, taux, devises, matières premières, banques centrales. Données publiques différées, pas de conseil en investissement.",
            "Free market terminal: indices, rates, currencies, commodities, central banks. Delayed public data, no investment advice.",
          )}
        </p>
      </div>
      <div className="animate-apparition [animation-delay:80ms]">{children}</div>
    </main>
  );
}
