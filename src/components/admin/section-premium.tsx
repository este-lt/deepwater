import { basculerPremium } from "@/app/admin/actions";
import { Carte } from "@/components/carte";
import type { Traduire } from "@/lib/i18n";

// Seul réglage restant côté administrateur : l'abonnement Alpha Vantage payant.
// Les classes d'actifs affichées se choisissent par chaque utilisateur sur le tableau de bord.
export function SectionPremium({ premium, t }: { premium: boolean; t: Traduire }) {
  return (
    <Carte titre={t("Abonnement Alpha Vantage premium", "Alpha Vantage premium subscription")}>
      <form action={basculerPremium} className="flex items-start justify-between gap-4">
        <input type="hidden" name="actif" value={String(!premium)} />
        <p className="text-sm text-attenue">
          {t(
            "À activer seulement si l'abonnement est payé : le S&P 500 et le Nasdaq-100 passent alors sur INDEX_DATA (ouverture, plus haut, plus bas, clôture). Sinon, ils restent sur FRED (clôtures officielles gratuites).",
            "Turn on only if the subscription is paid: the S&P 500 and Nasdaq-100 then use INDEX_DATA (open, high, low, close). Otherwise they stay on FRED (free official closes).",
          )}
        </p>
        <button
          type="submit"
          aria-pressed={premium}
          aria-label={t("Abonnement premium", "Premium subscription")}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${premium ? "bg-accent" : "bg-surface-3"}`}
        >
          <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${premium ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </form>
    </Carte>
  );
}
