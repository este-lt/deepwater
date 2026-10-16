import type { ReactNode } from "react";
import { Logo } from "./logo";

export function EcranConnexion({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center animate-apparition">
        <Logo taille="grand" />
        <p className="max-w-sm text-sm text-attenue">
          Suivi du S&amp;P 500 et du Nasdaq-100 à partir de données publiques différées.
          Pas de temps réel, pas de conseil en investissement.
        </p>
      </div>
      <div className="animate-apparition [animation-delay:80ms]">{children}</div>
    </main>
  );
}
