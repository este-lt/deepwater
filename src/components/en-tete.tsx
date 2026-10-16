import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { Logo } from "./logo";

export function EnTete({ estAdmin }: { estAdmin: boolean }) {
  return (
    <header className="sticky top-0 z-20 border-b border-bordure bg-fond/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="rounded-lg">
          <Logo />
        </Link>
        <form action="/recherche" role="search" className="ml-auto hidden max-w-xs flex-1 md:block">
          <label htmlFor="q-entete" className="sr-only">Recherche globale</label>
          <input
            id="q-entete"
            name="q"
            type="search"
            maxLength={60}
            placeholder="Rechercher un actif ou un mot-clé…"
            className="w-full rounded-lg border border-bordure bg-surface px-3 py-1.5 text-sm placeholder:text-discret focus:border-accent/60"
          />
        </form>
        <nav className="flex min-w-0 items-center gap-1 text-sm">
          <Link
            href="/recherche"
            aria-label="Recherche globale"
            className="rounded-lg px-2.5 py-1.5 text-attenue transition-colors hover:bg-surface-2 hover:text-texte md:hidden"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
              <circle cx="9" cy="9" r="6" />
              <path d="m13.5 13.5 4 4" strokeLinecap="round" />
            </svg>
          </Link>
          <Link href="/" className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-attenue transition-colors hover:bg-surface-2 hover:text-texte sm:px-3">
            <span className="sm:hidden">Accueil</span>
            <span className="hidden sm:inline">Tableau de bord</span>
          </Link>
          {estAdmin && (
            <Link
              href="/admin"
              className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-attenue transition-colors hover:bg-surface-2 hover:text-texte sm:px-3"
            >
              Admin
            </Link>
          )}
          <span className="ml-2 inline-flex">
            <UserButton />
          </span>
        </nav>
      </div>
    </header>
  );
}

export function Avertissement() {
  return (
    <p className="text-xs leading-relaxed text-discret">
      Données publiques gratuites, différées (jamais en temps réel). Le biais est un scoring automatique basé sur des
      règles : il ne constitue ni une prédiction garantie ni un conseil en investissement. L&apos;exécution des ordres se
      fait exclusivement chez votre broker, en dehors de Deepwater.
    </p>
  );
}
