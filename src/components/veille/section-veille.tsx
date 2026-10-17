import { Carte, Pastille } from "@/components/carte";
import { Horodatage } from "@/components/horodatage";
import { FilActualites, FilSquawks } from "@/components/veille/fil-actualites";
import { type Langue, traducteur } from "@/lib/i18n";
import type { EtatVeille } from "@/lib/veille";

export function SectionVeille({ veille, langue }: { veille: EtatVeille; langue: Langue }) {
  const t = traducteur(langue);
  return (
    <Carte
      titre={t("Actualités", "News")}
      actions={<Pastille ton="neutre">{t(`${veille.fenetreJours} derniers jours`, `Last ${veille.fenetreJours} days`)}</Pastille>}
      pied={
        <Horodatage
          iso={veille.verifieLe}
          source={t("WSJ, FT, CNBC, Fed, BCE (titre et court extrait, relus toutes les 30 min)", "WSJ, FT, CNBC, Fed, ECB (headline and short excerpt, every 30 min)")}
          seuilHeures={2}
        />
      }
    >
      {veille.articles.length === 0 ? (
        <p className="text-sm text-attenue">{t("Aucune actualité de marché retenue sur la période.", "No market news kept over the period.")}</p>
      ) : (
        <FilActualites articles={veille.articles} fenetreJours={veille.fenetreJours} />
      )}
    </Carte>
  );
}

export function SectionSquawks({ squawks, langue }: { squawks: EtatVeille; langue: Langue }) {
  const t = traducteur(langue);
  return (
    <Carte
      titre={t("Fil instantané", "Live squawk")}
      sousTitre={t(
        "Banques centrales, chiffres publiés, énergie et géopolitique ; faits divers et entreprises écartés.",
        "Central banks, data releases, energy and geopolitics; incidents and single companies filtered out.",
      )}
      actions={<Pastille ton="accent">24 h</Pastille>}
      pied={
        <Horodatage
          iso={squawks.verifieLe}
          source={t("FinancialJuice, InvestingLive (relus toutes les 5 min, titres traduits automatiquement)", "FinancialJuice, InvestingLive (every 5 min)")}
          seuilHeures={0.5}
        />
      }
    >
      <FilSquawks squawks={squawks.articles} />
    </Carte>
  );
}
