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
        <nav className="flex min-w-0 items-center gap-1 text-sm">
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
