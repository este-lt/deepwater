import { basculerMarche, basculerPremium } from "@/app/admin/actions";
import { Carte, Pastille } from "@/components/carte";
import type { CollecteRow, TickerRow } from "@/lib/types-supabase";

const CLASSES: Record<string, string> = { indice: "Indices", forex: "Forex", action: "Actions", matiere: "Matières premières", taux: "Taux" };

function Interrupteur({ actif, libelle }: { actif: boolean; libelle: string }) {
  return (
    <button
      type="submit"
      aria-pressed={actif}
      aria-label={libelle}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${actif ? "bg-accent" : "bg-surface-3"}`}
    >
      <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${actif ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function SectionMarches({
  tickers,
  collectes,
  premium,
}: {
  tickers: TickerRow[];
  collectes: CollecteRow[];
  premium: boolean;
}) {
  const parClasse = new Map<string, TickerRow[]>();
  for (const t of tickers) parClasse.set(t.classe_actif, [...(parClasse.get(t.classe_actif) ?? []), t]);
  const statutCollecte = new Map(collectes.filter((c) => c.ticker_id).map((c) => [c.ticker_id as string, c]));

  return (
    <Carte
      titre="Marchés et sources"
      sousTitre="Le S&P 500 et le Nasdaq-100 sont toujours suivis. Les autres marchés sont optionnels : chacun consomme du quota Alpha Vantage."
    >
      <div className="flex flex-col gap-5">
        <form action={basculerPremium} className="flex items-start justify-between gap-4 rounded-xl bg-surface-2 p-4">
          <input type="hidden" name="actif" value={String(!premium)} />
          <div>
            <p className="font-medium">Abonnement Alpha Vantage premium</p>
            <p className="text-sm text-attenue">
              À activer seulement si l&apos;abonnement est payé : les indices passent alors sur INDEX_DATA (ouverture,
              plus haut, plus bas, clôture). Sinon, ils restent sur FRED (clôtures officielles gratuites).
            </p>
          </div>
          <Interrupteur actif={premium} libelle="Abonnement premium" />
        </form>

        {[...parClasse.entries()].map(([classe, liste]) => (
          <div key={classe}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-discret">{CLASSES[classe] ?? classe}</h3>
            <ul className="divide-y divide-bordure">
              {liste.map((t) => {
                const collecte = statutCollecte.get(t.id);
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {t.nom} <span className="text-xs text-attenue">{t.symbole}</span>
                      </p>
                      <p className="text-xs text-attenue">
                        {t.source_principale === "fred" ? "FRED" : "Alpha Vantage"}
                        {collecte?.dernier_statut && ` · dernière collecte : ${collecte.dernier_statut}`}
                      </p>
                    </div>
                    {t.prioritaire ? (
                      <Pastille ton="accent">Toujours actif</Pastille>
                    ) : (
                      <form action={basculerMarche}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="actif" value={String(!t.actif_bool)} />
                        <Interrupteur actif={t.actif_bool} libelle={`${t.actif_bool ? "Désactiver" : "Activer"} ${t.nom}`} />
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Carte>
  );
}
