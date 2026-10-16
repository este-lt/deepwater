import type { ReactNode } from "react";

interface PropsCarte {
  titre?: ReactNode;
  sousTitre?: ReactNode;
  actions?: ReactNode;
  pied?: ReactNode;
  children: ReactNode;
  className?: string;
  // Décalage de l'animation d'apparition (ms), pour un effet en cascade discret.
  delai?: number;
  id?: string;
}

export function Carte({ titre, sousTitre, actions, pied, children, className = "", delai = 0, id }: PropsCarte) {
  return (
    <section
      id={id}
      style={{ animationDelay: `${delai}ms` }}
      className={`min-w-0 rounded-carte border border-bordure bg-surface p-5 animate-apparition sm:p-6 ${className}`}
    >
      {(titre || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {titre && <h2 className="text-[0.95rem] font-semibold tracking-tight">{titre}</h2>}
            {sousTitre && <p className="mt-0.5 text-sm text-attenue">{sousTitre}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
      {pied && <footer className="mt-4 border-t border-bordure pt-3">{pied}</footer>}
    </section>
  );
}

export function Pastille({
  ton = "neutre",
  children,
}: {
  ton?: "hausse" | "baisse" | "neutre" | "accent" | "alerte";
  children: ReactNode;
}) {
  const tons = {
    hausse: "bg-hausse-doux text-hausse",
    baisse: "bg-baisse-doux text-baisse",
    neutre: "bg-neutre-doux text-neutre",
    accent: "bg-accent-doux text-accent-clair",
    alerte: "bg-alerte-doux text-alerte",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${tons[ton]}`}>
      {children}
    </span>
  );
}
