// Dépôts SEC récents (10-K, 10-Q, 8-K, formulaires 4, 13F...) via l'API
// "submissions" : détection des nouveaux dépôts et résumé court automatique.
import { cik10, requeteSec, urlDocument, urlIndexDepot } from "../_shared/sec.ts";
import { admin } from "../_shared/supabase.ts";

export interface EntrepriseSec {
  symbole: string;
  cik: string;
}

interface Soumissions {
  name: string;
  sicDescription?: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      form: string[];
      primaryDocument: string[];
      items: string[];
    };
  };
}

const FORMULAIRES_SUIVIS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A", "4", "4/A", "SC 13D", "SC 13G", "SC 13D/A", "SC 13G/A", "DEF 14A"]);

// Libellés des rubriques 8-K les plus fréquentes (règlement SEC, Form 8-K).
const RUBRIQUES_8K: Record<string, string> = {
  "1.01": "accord important conclu",
  "1.02": "fin d'un accord important",
  "1.05": "incident de cybersécurité",
  "2.01": "acquisition ou cession d'actifs",
  "2.02": "publication de résultats",
  "2.03": "nouvelle obligation financière",
  "2.05": "coûts de restructuration",
  "2.06": "dépréciation importante",
  "3.01": "risque de radiation de la cote",
  "4.01": "changement d'auditeur",
  "5.02": "changement de dirigeant ou d'administrateur",
  "5.03": "modification des statuts",
  "5.07": "vote des actionnaires",
  "7.01": "communication réglementaire (Reg FD)",
  "8.01": "autre événement",
  "9.01": "états financiers et annexes",
};

export function resumerDepot(formulaire: string, rubriques: string, dateRapport: string): string {
  const periode = dateRapport ? ` (période close le ${dateRapport})` : "";
  switch (formulaire.replace("/A", "")) {
    case "10-K":
      return `Rapport annuel${periode}${formulaire.endsWith("/A") ? ", rectificatif" : ""}.`;
    case "10-Q":
      return `Rapport trimestriel${periode}${formulaire.endsWith("/A") ? ", rectificatif" : ""}.`;
    case "8-K": {
      const libelles = rubriques.split(",").map((r) => r.trim()).filter(Boolean)
        .map((r) => RUBRIQUES_8K[r] ?? `rubrique ${r}`);
      return `Événement important : ${libelles.length ? libelles.join(", ") : "non précisé"}.`;
    }
    case "4":
      return "Déclaration de transaction d'un initié (dirigeant, administrateur ou actionnaire > 10 %).";
    case "SC 13D":
    case "SC 13G":
      return "Franchissement du seuil de 5 % du capital par un investisseur.";
    case "DEF 14A":
      return "Document de convocation à l'assemblée des actionnaires.";
    default:
      return formulaire;
  }
}

export async function collecterDepots(
  entreprises: EntrepriseSec[],
  joursRecents = 60,
): Promise<{ nouveaux: number; secteurs: Record<string, string>; formulaires4: { symbole: string; cik: string; numero: string; date: string; document: string }[] }> {
  const limite = new Date(Date.now() - joursRecents * 86_400_000).toISOString().slice(0, 10);
  const secteurs: Record<string, string> = {};
  const formulaires4: { symbole: string; cik: string; numero: string; date: string; document: string }[] = [];
  let nouveaux = 0;

  for (const e of entreprises) {
    const r = await requeteSec(`https://data.sec.gov/submissions/CIK${cik10(e.cik)}.json`);
    const s = await r.json() as Soumissions;
    if (s.sicDescription) secteurs[e.symbole] = s.sicDescription;
    const rec = s.filings.recent;
    const lignes: Record<string, unknown>[] = [];
    for (let i = 0; i < rec.accessionNumber.length; i++) {
      const date = rec.filingDate[i];
      if (date < limite) break; // tri du plus récent au plus ancien
      const formulaire = rec.form[i];
      if (!FORMULAIRES_SUIVIS.has(formulaire)) continue;
      if (formulaire === "4" || formulaire === "4/A") {
        formulaires4.push({ symbole: e.symbole, cik: e.cik, numero: rec.accessionNumber[i], date, document: rec.primaryDocument[i] });
      }
      lignes.push({
        entreprise: e.symbole,
        cik: e.cik,
        type_formulaire: formulaire,
        date_depot: date,
        resume_auto: resumerDepot(formulaire, rec.items[i] ?? "", rec.reportDate[i] ?? ""),
        url_source: rec.primaryDocument[i]
          ? urlDocument(e.cik, rec.accessionNumber[i], rec.primaryDocument[i])
          : urlIndexDepot(e.cik, rec.accessionNumber[i]),
        numero_acces: rec.accessionNumber[i],
      });
    }
    if (lignes.length) {
      const { data, error } = await admin()
        .from("depots_sec_recents")
        .upsert(lignes, { onConflict: "numero_acces", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`Écriture des dépôts ${e.symbole} impossible : ${error.message}`);
      nouveaux += data?.length ?? 0;
    }
  }
  return { nouveaux, secteurs, formulaires4 };
}
