// Collecte des clôtures S&P 500 / Nasdaq-100 (et indices optionnels actifs) via
// FRED, puis recalcul des moyennes mobiles. Avec l'abonnement Alpha Vantage
// premium (config av_premium), les indices passent sur INDEX_DATA (OHLC).
import { lireSerieFred } from "../_shared/fred.ts";
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { derniereDatePrix, enregistrerPrix } from "../_shared/prix.ts";
import { admin } from "../_shared/supabase.ts";

const HISTORIQUE_ANS = 10;
const RECHARGE_JOURS = 30;

servirTacheProtegee(async () => {
  const resultat = await executerTache("collecte-indices", async () => {
    const { data: config } = await admin().from("config_app").select("valeur").eq("cle", "av_premium").maybeSingle();
    const premium = config?.valeur === true;

    // Active ou coupe la collecte Alpha Vantage INDEX_DATA selon l'abonnement.
    const { error: erreurBascule } = await admin()
      .from("collectes_planifiees")
      .update({ actif: premium })
      .eq("groupe", "premium:indices");
    if (erreurBascule) throw new Error(`Bascule premium impossible : ${erreurBascule.message}`);

    const { data: tickers, error } = await admin()
      .from("tickers_suivis")
      .select("id, symbole, symboles_source")
      .eq("source_principale", "fred")
      .eq("actif_bool", true);
    if (error) throw new Error(`Lecture des tickers impossible : ${error.message}`);

    const bilan: Record<string, unknown> = {};
    const erreurs: string[] = [];
    for (const t of tickers ?? []) {
      const symboles = t.symboles_source as { fred?: string; alpha_vantage?: string };
      if (premium && symboles.alpha_vantage) {
        bilan[t.symbole] = "géré par Alpha Vantage premium";
        continue;
      }
      if (!symboles.fred) continue;
      try {
        const { observations, depuisCache } = await lireSerieFred(symboles.fred);
        const derniere = await derniereDatePrix(t.id);
        const limite = new Date();
        if (derniere) limite.setUTCDate(limite.getUTCDate() - RECHARGE_JOURS);
        else limite.setUTCFullYear(limite.getUTCFullYear() - HISTORIQUE_ANS);
        const seuil = limite.toISOString().slice(0, 10);

        const barres = observations
          .filter(([date]) => date >= seuil)
          .map(([date, valeur]) => ({
            date,
            ouverture: null,
            plus_haut: null,
            plus_bas: null,
            cloture: valeur,
            volume: null,
          }));
        const ecriture = await enregistrerPrix(t.id, barres, `fred:${symboles.fred}`);
        const derniereObs = observations[observations.length - 1];
        bilan[t.symbole] = {
          serie: symboles.fred,
          depuis_cache: depuisCache,
          lignes_ecrites: ecriture.lignes,
          moyennes_mises_a_jour: ecriture.moyennesMisesAJour,
          derniere_cloture: derniereObs,
        };
      } catch (erreur) {
        const message = erreur instanceof Error ? erreur.message : String(erreur);
        erreurs.push(`${t.symbole} : ${message}`);
        bilan[t.symbole] = { erreur: message };
      }
    }

    // Une source en panne est journalisée sans bloquer les autres ; tout en panne = échec.
    if (erreurs.length && erreurs.length === (tickers ?? []).length) throw new Error(erreurs.join(" | "));
    const resume = Object.entries(bilan)
      .map(([s, b]) => {
        const d = b as { derniere_cloture?: [string, number] };
        return d.derniere_cloture ? `${s} ${d.derniere_cloture[1]} (${d.derniere_cloture[0]})` : `${s} ${JSON.stringify(b)}`;
      })
      .join(", ");
    return { message: `Indices à jour : ${resume}${erreurs.length ? ` — erreurs : ${erreurs.join(" | ")}` : ""}`, details: bilan };
  });
  return json(resultat, resultat.ok ? 200 : 500);
});
