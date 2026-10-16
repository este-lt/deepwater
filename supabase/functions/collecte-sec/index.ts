// Collecte SEC EDGAR (gratuite, sans clé) : dépôts récents et contrôle croisé des
// fondamentales. Données déclaratives, publiées avec un délai légal : jamais du temps réel.
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { admin } from "../_shared/supabase.ts";
import { collecterDepots, type EntrepriseSec } from "./depots.ts";
import { controlerFondamentales } from "./fondamentales.ts";

async function actionsActives(): Promise<EntrepriseSec[]> {
  const { data, error } = await admin()
    .from("tickers_suivis")
    .select("symbole, symboles_source")
    .eq("classe_actif", "action")
    .eq("actif_bool", true);
  if (error) throw new Error(`Lecture des actions impossible : ${error.message}`);
  return (data ?? [])
    .map((t) => ({ symbole: t.symbole, cik: (t.symboles_source as { cik?: string }).cik ?? "" }))
    .filter((e) => e.cik);
}

servirTacheProtegee(async (corps) => {
  const mode = typeof corps.mode === "string" ? corps.mode : "quotidien";
  const resultat = await executerTache(`collecte-sec`, async () => {
    const morceaux: string[] = [];
    const details: Record<string, unknown> = { mode };

    if (mode === "quotidien" || mode === "depots") {
      const actions = await actionsActives();
      const depots = await collecterDepots(actions);
      morceaux.push(`${depots.nouveaux} nouveau(x) dépôt(s) pour ${actions.length} action(s) suivie(s)`);
      details.depots = { nouveaux: depots.nouveaux, secteurs: depots.secteurs };
    }
    if (mode === "quotidien" || mode === "fondamentales") {
      const controle = await controlerFondamentales();
      morceaux.push(controle.message);
      details.fondamentales = controle.details;
    }
    return { message: morceaux.join(" — ") || `Mode inconnu : ${mode}`, details };
  });
  return json(resultat, resultat.ok ? 200 : 500);
});
