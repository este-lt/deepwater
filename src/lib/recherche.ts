import "server-only";
import type { ClientSupabase } from "./supabase";

// Recherche globale dans les données déjà en base (aucun appel externe).

export function nettoyerRecherche(brut: string | string[] | undefined): string {
  const texte = Array.isArray(brut) ? brut[0] ?? "" : brut ?? "";
  // Lettres, chiffres, espaces et & . ' - uniquement : le texte part dans des filtres ilike.
  return texte.normalize("NFC").replace(/[^\p{L}\p{N}\s&.'-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export interface ResultatsRecherche {
  q: string;
  instruments: { symbole: string; nom: string; classe: string; actif: boolean; prioritaire: boolean }[];
  entreprises: { symbole: string; nom: string; secteur: string; cik: string }[];
  institutions: { nom: string; cik: string; lignes: number; dernierRapport: string | null }[];
  articles: { id: number; titre: string; source: string; url: string; date_publication: string; categorie: string | null; impact_niveau: string }[];
  transactions: { id: number; entreprise: string; personne: string; poste: string | null; type_transaction: string; montant: number | null; date: string; source_formulaire: string }[];
  calendrier: { id: number; libelle: string; date_evenement: string; type_evenement: string; source_donnee: string }[];
  total: number;
}

// Les titres d'actualités sont en anglais : quelques équivalents pour les recherches en français.
const EQUIVALENTS: Record<string, string[]> = {
  inflation: ["inflation", "CPI", "consumer prices"],
  chomage: ["unemployment", "jobless"],
  emploi: ["payrolls", "jobs report"],
  emplois: ["payrolls", "jobs report"],
  petrole: ["oil", "crude"],
  taux: ["rate", "yield"],
  resultats: ["earnings", "results"],
  fusion: ["merger", "takeover"],
  acquisition: ["acquire", "acquisition"],
  "banque centrale": ["central bank"],
  bce: ["ECB"],
  croissance: ["GDP", "growth"],
  pib: ["GDP"],
};
const sansAccents = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const unique = <T,>(lignes: T[], cle: (l: T) => string | number) => [...new Map(lignes.map((l) => [cle(l), l])).values()];

export async function rechercher(supabase: ClientSupabase, q: string): Promise<ResultatsRecherche> {
  const motif = `%${q}%`;
  const termes = [q, ...(EQUIVALENTS[sansAccents(q)] ?? [])].slice(0, 4);
  const [tickersSymbole, tickersNom, entSymbole, entNom, entSecteur, inst, articles, articlesLies, inities, initiesEnt, calendrier] = await Promise.all([
    supabase.from("tickers_suivis").select("symbole, nom, classe_actif, actif_bool, prioritaire").ilike("symbole", motif).limit(10),
    supabase.from("tickers_suivis").select("symbole, nom, classe_actif, actif_bool, prioritaire").ilike("nom", motif).limit(10),
    supabase.from("entreprises_suivies_sec").select("symbole, nom, secteur, cik").ilike("symbole", motif).limit(10),
    supabase.from("entreprises_suivies_sec").select("symbole, nom, secteur, cik").ilike("nom", motif).limit(10),
    supabase.from("entreprises_suivies_sec").select("symbole, nom, secteur, cik").ilike("secteur", motif).limit(10),
    supabase.from("institutions_suivies").select("nom, cik").ilike("nom", motif).limit(10),
    Promise.all(
      termes.map((t) =>
        supabase
          .from("articles")
          .select("id, titre, source, url, date_publication, categorie, impact_niveau")
          .ilike("titre", `%${t}%`)
          .order("date_publication", { ascending: false })
          .limit(15)
      ),
    ).then((rs) => ({ data: rs.flatMap((r) => r.data ?? []), error: rs.find((r) => r.error)?.error ?? null })),
    // Articles rattachés à un symbole (ex. NVDA pour un titre qui cite « Nvidia »).
    supabase
      .from("articles")
      .select("id, titre, source, url, date_publication, categorie, impact_niveau")
      .contains("tickers_lies", [q.toUpperCase()])
      .order("date_publication", { ascending: false })
      .limit(15),
    supabase
      .from("flux_inities")
      .select("id, entreprise, personne, poste, type_transaction, montant, date, source_formulaire")
      .in("code_transaction", ["P", "S"])
      .ilike("personne", motif)
      .order("date", { ascending: false })
      .limit(10),
    supabase
      .from("flux_inities")
      .select("id, entreprise, personne, poste, type_transaction, montant, date, source_formulaire")
      .in("code_transaction", ["P", "S"])
      .eq("entreprise", q.toUpperCase())
      .order("date", { ascending: false })
      .limit(10),
    supabase
      .from("calendrier_economique")
      .select("id, libelle, date_evenement, type_evenement, source_donnee")
      .ilike("libelle", motif)
      .gte("date_evenement", new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10))
      .order("date_evenement", { ascending: true })
      .limit(10),
  ]);
  for (const r of [tickersSymbole, tickersNom, entSymbole, entNom, entSecteur, inst, articles, articlesLies, inities, initiesEnt, calendrier]) {
    if (r.error) throw new Error(`Recherche impossible : ${r.error.message}`);
  }

  // Résumé des positions déclarées par chaque institution trouvée.
  const institutions = await Promise.all(
    (inst.data ?? []).map(async (i) => {
      const { data, count } = await supabase
        .from("positions_institutionnelles")
        .select("date_rapport", { count: "exact" })
        .eq("cik_institution", i.cik)
        .order("date_rapport", { ascending: false })
        .limit(1);
      return { nom: i.nom, cik: i.cik, lignes: count ?? 0, dernierRapport: data?.[0]?.date_rapport ?? null };
    }),
  );

  const resultats = {
    q,
    instruments: unique([...(tickersSymbole.data ?? []), ...(tickersNom.data ?? [])], (t) => t.symbole).map((t) => ({
      symbole: t.symbole,
      nom: t.nom,
      classe: t.classe_actif,
      actif: t.actif_bool,
      prioritaire: t.prioritaire,
    })),
    entreprises: unique([...(entSymbole.data ?? []), ...(entNom.data ?? []), ...(entSecteur.data ?? [])], (e) => e.symbole),
    institutions,
    articles: unique([...(articles.data ?? []), ...(articlesLies.data ?? [])], (a) => a.id)
      .sort((a, b) => b.date_publication.localeCompare(a.date_publication))
      .slice(0, 15),
    transactions: unique([...(initiesEnt.data ?? []), ...(inities.data ?? [])], (t) => t.id).map((t) => ({
      ...t,
      montant: t.montant === null ? null : Number(t.montant),
    })),
    calendrier: calendrier.data ?? [],
  };
  const total = resultats.instruments.length + resultats.entreprises.length + resultats.institutions.length +
    resultats.articles.length + resultats.transactions.length + resultats.calendrier.length;
  return { ...resultats, total };
}
