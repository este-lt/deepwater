import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { traducteur } from "@/lib/i18n";
import { lirePreferences } from "@/lib/preferences";
import { supabaseUtilisateur } from "@/lib/supabase";
import { BarreCommandes } from "./barre-commandes";
import { Logo } from "./logo";

const LIEN = "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-attenue transition-colors hover:bg-surface-2 hover:text-texte sm:px-3";

// Alertes de fonctionnement ouvertes (tâche en retard ou en échec), lisibles par l'admin seul.
async function alertesOuvertes(): Promise<number> {
  const { count } = await (await supabaseUtilisateur()).from("alertes").select("id", { count: "exact", head: true }).is("resolue_le", null);
  return count ?? 0;
}

export async function EnTete({ estAdmin }: { estAdmin: boolean }) {
  const t = traducteur((await lirePreferences()).langue);
  const alertes = estAdmin ? await alertesOuvertes().catch(() => 0) : 0;
  return (
    <header className="barre-haute sticky top-0 z-20 border-b border-bordure bg-fond/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="marges-securite mx-auto flex max-w-[90rem] items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="shrink-0 rounded-lg">
          <Logo />
        </Link>
        <form action="/recherche" role="search" className="ml-auto hidden max-w-xs flex-1 lg:block">
          <label htmlFor="q-entete" className="sr-only">{t("Recherche globale", "Global search")}</label>
          <input
            id="q-entete"
            name="q"
            type="search"
            maxLength={60}
            placeholder={t("Rechercher un actif ou un mot-clé…", "Search an asset or keyword…")}
            className="w-full rounded-lg border border-bordure bg-surface px-3 py-1.5 text-sm placeholder:text-discret focus:border-accent/60"
          />
        </form>
        <BarreCommandes estAdmin={estAdmin} />
        <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm">
          <Link href="/recherche" aria-label={t("Recherche globale", "Global search")} className={`${LIEN} lg:hidden`}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="size-4" aria-hidden>
              <circle cx="9" cy="9" r="6" />
              <path d="m13.5 13.5 4 4" strokeLinecap="round" />
            </svg>
          </Link>
          <Link href="/" className={LIEN}>
            <span className="sm:hidden">{t("Accueil", "Home")}</span>
            <span className="hidden sm:inline">{t("Tableau de bord", "Dashboard")}</span>
          </Link>
          <Link href="/rapport" className={LIEN}>{t("Rapport", "Report")}</Link>
          <Link href="/parametres" aria-label={t("Paramètres", "Settings")} className={LIEN}>
            <span className="hidden md:inline">{t("Paramètres", "Settings")}</span>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-4 md:hidden" aria-hidden>
              <circle cx="10" cy="10" r="2.6" />
              <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" strokeLinecap="round" />
            </svg>
          </Link>
          {estAdmin && (
            <Link href="/admin" className={LIEN}>
              Admin
              {alertes > 0 && (
                <span
                  title={t(`${alertes} alerte(s) de fonctionnement`, `${alertes} operational alert(s)`)}
                  className="chiffres ml-1.5 rounded-full bg-baisse px-1.5 py-px text-[0.7rem] font-semibold text-white"
                >
                  {alertes}
                </span>
              )}
            </Link>
          )}
          <span className="ml-2 inline-flex shrink-0">
            <UserButton />
          </span>
        </nav>
      </div>
    </header>
  );
}

export async function Avertissement() {
  const t = traducteur((await lirePreferences()).langue);
  return (
    <p className="text-xs leading-relaxed text-discret">
      {t(
        "Données publiques gratuites, différées (jamais en temps réel, sauf le fil instantané et la crypto). Biais, régime et force des devises sont des scorings automatiques basés sur des règles : ni prédiction garantie, ni conseil en investissement. L'exécution des ordres se fait exclusivement chez votre broker, en dehors de Deepwater.",
        "Free public data, delayed (never real time, except the live squawk and crypto). Bias, regime and currency strength are automatic rules-based scores: neither guaranteed predictions nor investment advice. Orders are executed exclusively with your broker, outside Deepwater.",
      )}
    </p>
  );
}
