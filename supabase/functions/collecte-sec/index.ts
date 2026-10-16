// Collecte SEC EDGAR (gratuite, sans clé). Données déclaratives, publiées avec un
// délai légal : jamais du temps réel. Modes appelés par pg_cron :
//  - depots        : nouveaux dépôts des entreprises suivies (puis analyse des formulaires 4) ;
//  - form4         : analyse des formulaires 4 en attente (reprise par lots) ;
//  - 13f           : positions trimestrielles des institutions suivies ;
//  - fondamentales : contrôle croisé Alpha Vantage / 10-K des actions optionnelles.
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { admin } from "../_shared/supabase.ts";
import { collecterDepots, type EntrepriseSec } from "./depots.ts";
import { traiterFormulaires4 } from "./formulaire4.ts";
import { controlerFondamentales } from "./fondamentales.ts";
import { collecter13F } from "./treize-f.ts";

// Univers : grandes capitalisations des indices + actions optionnelles activées.
async function entreprisesSuivies(): Promise<EntrepriseSec[]> {
  const [indices, actions] = await Promise.all([
    admin().from("entreprises_suivies_sec").select("symbole, cik").eq("actif", true),
    admin().from("tickers_suivis").select("symbole, symboles_source").eq("classe_actif", "action").eq("actif_bool", true),
  ]);
  if (indices.error || actions.error) {
    throw new Error(`Lecture des entreprises suivies impossible : ${(indices.error ?? actions.error)?.message}`);
  }
  const liste = new Map<string, EntrepriseSec>();
  for (const e of indices.data ?? []) liste.set(e.symbole, { symbole: e.symbole, cik: e.cik });
  for (const t of actions.data ?? []) {
    const cik = (t.symboles_source as { cik?: string }).cik;
    if (cik && !liste.has(t.symbole)) liste.set(t.symbole, { symbole: t.symbole, cik });
  }
  return [...liste.values()];
}

servirTacheProtegee(async (corps) => {
  const mode = typeof corps.mode === "string" ? corps.mode : "depots";
  const resultat = await executerTache(`collecte-sec`, async () => {
    const morceaux: string[] = [];
    const details: Record<string, unknown> = { mode };

    if (mode === "depots") {
      const entreprises = await entreprisesSuivies();
      const depots = await collecterDepots(entreprises);
      morceaux.push(`${depots.nouveaux} nouveau(x) dépôt(s) pour ${entreprises.length} entreprise(s)`);
      details.depots = depots;
    }
    if (mode === "depots" || mode === "form4") {
      const f4 = await traiterFormulaires4(mode === "form4" ? 60 : 40);
      morceaux.push(`${f4.traites} formulaire(s) 4 analysé(s), ${f4.transactions} transaction(s)`);
      if (f4.erreurs.length) morceaux.push(`${f4.erreurs.length} formulaire(s) illisible(s), repris plus tard`);
      details.formulaires4 = f4;
    }
    if (mode === "13f") {
      const r = await collecter13F();
      morceaux.push(`13F : ${r.lignes} position(s) pour ${r.institutions} institution(s)`);
      if (r.erreurs.length) morceaux.push(`erreurs : ${r.erreurs.join(" | ")}`);
      if (r.anomalies.length) morceaux.push(`${r.anomalies.length} ligne(s) écartée(s) (CUSIP/nom incohérents)`);
      details.treize_f = r;
    }
    if (mode === "fondamentales") {
      const controle = await controlerFondamentales();
      morceaux.push(controle.message);
      details.fondamentales = controle.details;
    }
    if (morceaux.length === 0) throw new Error(`Mode inconnu : ${mode}`);
    return { message: morceaux.join(" — "), details };
  });
  return json(resultat, resultat.ok ? 200 : 500);
});
