// Formulaires 4 (transactions d'initiés) : lecture du XML officiel et écriture
// d'une ligne par transaction non dérivée. Analyse par lots pour rester dans la
// limite de durée d'une Edge Function.
import { requeteSec } from "../_shared/sec.ts";
import { admin } from "../_shared/supabase.ts";

// Codes de transaction du formulaire 4 (instructions SEC, Form 4, General Instruction 8).
export const CODES_TRANSACTION: Record<string, string> = {
  P: "Achat sur le marché",
  S: "Vente sur le marché",
  A: "Attribution (rémunération)",
  M: "Exercice d'options",
  X: "Exercice d'options",
  F: "Titres retenus pour l'impôt",
  G: "Donation",
  D: "Cession à l'émetteur",
  C: "Conversion",
  J: "Autre",
  I: "Transaction discrétionnaire",
  W: "Héritage",
  K: "Opération de swap",
  V: "Déclaration volontaire anticipée",
};

const premier = (xml: string, balise: string): string | null =>
  xml.match(new RegExp(`<${balise}>([\\s\\S]*?)</${balise}>`))?.[1] ?? null;
// Les valeurs du formulaire 4 sont dans <champ><value>...</value></champ>.
const valeur = (xml: string, balise: string): string | null => {
  const bloc = premier(xml, balise);
  if (bloc === null) return null;
  return (premier(bloc, "value") ?? bloc).trim() || null;
};
const nombre = (texte: string | null): number | null => {
  if (texte === null) return null;
  const n = Number(texte.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const decoder = (t: string) =>
  t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&quot;/g, '"');

export interface TransactionInitie {
  personne: string;
  poste: string;
  titre: string | null;
  date: string;
  code: string;
  acquisCede: "A" | "D" | null;
  titres: number | null;
  prix: number | null;
  montant: number | null;
}

export function analyserFormulaire4(xml: string): TransactionInitie[] {
  const proprietaires = [...xml.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/g)].map((m) => m[1]);
  const premierProprietaire = proprietaires[0] ?? "";
  const noms = proprietaires.map((p) => decoder((premier(p, "rptOwnerName") ?? "").trim())).filter(Boolean);
  const lien = premier(premierProprietaire, "reportingOwnerRelationship") ?? "";
  const vrai = (b: string) => /^(1|true)$/i.test((premier(lien, b) ?? "").trim());
  const titreDirigeant = decoder((premier(lien, "officerTitle") ?? "").trim());
  const poste = titreDirigeant ||
    (vrai("isDirector") ? "Administrateur" : vrai("isTenPercentOwner") ? "Actionnaire > 10 %" : vrai("isOther") ? "Autre" : "Initié");

  const transactions: TransactionInitie[] = [];
  for (const m of xml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g)) {
    const bloc = m[1];
    const date = valeur(bloc, "transactionDate");
    const code = (premier(premier(bloc, "transactionCoding") ?? "", "transactionCode") ?? "").trim();
    if (!date || !code) continue;
    const titres = nombre(valeur(bloc, "transactionShares"));
    const prix = nombre(valeur(bloc, "transactionPricePerShare"));
    const sens = valeur(bloc, "transactionAcquiredDisposedCode");
    transactions.push({
      personne: noms.join(" ; ") || "Inconnu",
      poste,
      titre: valeur(bloc, "securityTitle"),
      date: date.slice(0, 10),
      code,
      acquisCede: sens === "A" || sens === "D" ? sens : null,
      titres,
      prix,
      montant: titres !== null && prix !== null && prix > 0 ? Math.round(titres * prix * 100) / 100 : null,
    });
  }
  return transactions;
}

function formaterMontant(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2).replace(".", ",")} Md$`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")} M$`;
  if (v >= 1e3) return `${Math.round(v / 1e3)} k$`;
  return `${Math.round(v)} $`;
}

export function resumerFormulaire4(transactions: TransactionInitie[]): string {
  if (transactions.length === 0) return "Formulaire 4 sans transaction sur actions (dérivés uniquement).";
  const principale = [...transactions].sort((a, b) => (b.montant ?? 0) - (a.montant ?? 0))[0];
  const titres = principale.titres !== null ? `${new Intl.NumberFormat("fr-FR").format(principale.titres)} actions` : "actions";
  const prix = principale.prix ? ` à ${principale.prix.toFixed(2).replace(".", ",")} $` : "";
  const montant = principale.montant ? ` (${formaterMontant(principale.montant)})` : "";
  const autres = transactions.length > 1 ? `, + ${transactions.length - 1} autre(s) ligne(s)` : "";
  return `${CODES_TRANSACTION[principale.code] ?? `Code ${principale.code}`} : ${titres}${prix}${montant} — ${principale.personne} (${principale.poste}), le ${principale.date}${autres}.`;
}

// XML brut : le document principal pointe vers la version mise en forme
// (".../xslF345X06/fichier.xml") ; le XML d'origine est le même fichier sans ce dossier.
export function urlXmlBrut(urlSource: string): string {
  return urlSource.replace(/\/xsl[^/]+\/([^/]+)$/, "/$1");
}

export async function traiterFormulaires4(limite = 50): Promise<{ traites: number; transactions: number; erreurs: string[] }> {
  const { data: enAttente, error } = await admin()
    .from("depots_sec_recents")
    .select("id, entreprise, cik, numero_acces, date_depot, url_source")
    .in("type_formulaire", ["4", "4/A"])
    .is("traite_le", null)
    .order("date_depot", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Lecture des formulaires 4 en attente impossible : ${error.message}`);

  const { data: secteurs } = await admin().from("entreprises_suivies_sec").select("symbole, secteur");
  const secteurPar = new Map((secteurs ?? []).map((s) => [s.symbole, s.secteur]));

  let transactionsEcrites = 0;
  const erreurs: string[] = [];
  for (const depot of enAttente ?? []) {
    try {
      const urlXml = urlXmlBrut(depot.url_source);
      const xml = await (await requeteSec(urlXml)).text();
      const transactions = analyserFormulaire4(xml);
      if (transactions.length) {
        const lignes = transactions.map((t, i) => ({
          entreprise: depot.entreprise,
          cik: depot.cik,
          secteur: secteurPar.get(depot.entreprise) ?? null,
          personne: t.personne.slice(0, 200),
          poste: t.poste.slice(0, 200),
          type_transaction: CODES_TRANSACTION[t.code] ?? `Code ${t.code}`,
          code_transaction: t.code,
          acquis_cede: t.acquisCede,
          nombre_titres: t.titres,
          prix_unitaire: t.prix,
          montant: t.montant,
          date: t.date,
          date_depot: depot.date_depot,
          source_formulaire: depot.url_source,
          numero_acces: depot.numero_acces,
          ligne: i + 1,
        }));
        const { error: erreurEcriture } = await admin().from("flux_inities").upsert(lignes, { onConflict: "numero_acces,ligne" });
        if (erreurEcriture) throw new Error(erreurEcriture.message);
        transactionsEcrites += lignes.length;
      }
      await admin()
        .from("depots_sec_recents")
        .update({ traite_le: new Date().toISOString(), resume_auto: resumerFormulaire4(transactions) })
        .eq("id", depot.id);
    } catch (e) {
      // Un formulaire illisible n'arrête pas le lot ; il sera repris au prochain passage.
      erreurs.push(`${depot.entreprise} ${depot.numero_acces} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { traites: (enAttente ?? []).length - erreurs.length, transactions: transactionsEcrites, erreurs };
}
