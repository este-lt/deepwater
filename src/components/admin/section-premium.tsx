import { basculerPremium } from "@/app/admin/actions";
import { Carte } from "@/components/carte";

// Seul réglage restant côté administrateur : l'abonnement Alpha Vantage payant.
// Les classes d'actifs affichées se choisissent par chaque utilisateur sur le tableau de bord.
export function SectionPremium({ premium }: { premium: boolean }) {
  return (
    <Carte titre="Abonnement Alpha Vantage premium">
      <form action={basculerPremium} className="flex items-start justify-between gap-4">
        <input type="hidden" name="actif" value={String(!premium)} />
        <p className="text-sm text-attenue">
          À activer seulement si l&apos;abonnement est payé : le S&amp;P 500 et le Nasdaq-100 passent alors sur INDEX_DATA
          (ouverture, plus haut, plus bas, clôture). Sinon, ils restent sur FRED (clôtures officielles gratuites).
        </p>
        <button
          type="submit"
          aria-pressed={premium}
          aria-label="Abonnement premium"
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${premium ? "bg-accent" : "bg-surface-3"}`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${premium ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </form>
    </Carte>
  );
}
