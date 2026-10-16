// Veille RSS : WSJ, FT, CNBC, Fed, BCE. Seuls les articles retenus par le filtre
// strict sont stockés (titre, lien, date, source, extrait court). Un flux en panne
// est journalisé et ignoré, sans bloquer les autres.
import { enregistrerArticles, type ArticleRetenu } from "../_shared/articles.ts";
import { classerArticle } from "../_shared/filtre-actualites.ts";
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { analyserRss, extraitCourt, urlCanonique } from "../_shared/rss.ts";
import { admin } from "../_shared/supabase.ts";

export const FLUX: Record<string, string> = {
  "WSJ Marchés": "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
  "FT Marchés": "https://www.ft.com/markets?format=rss",
  "FT Europe": "https://www.ft.com/world/europe?format=rss",
  "CNBC Marchés": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20409666",
  "CNBC Économie": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258",
  "Fed": "https://www.federalreserve.gov/feeds/press_monetary.xml",
  "BCE": "https://www.ecb.europa.eu/rss/press.html",
};

const FRAICHEUR_JOURS = 7;

// Après une modification des règles : repasse les articles stockés au filtre, supprime
// ceux qui ne passent plus et met à jour la catégorie des autres.
async function reclasser() {
  const { data, error } = await admin().from("articles").select("id, titre, source, extrait_court");
  if (error) throw new Error(`Lecture des articles impossible : ${error.message}`);
  const rejetes: number[] = [];
  let gardes = 0;
  for (const a of data ?? []) {
    const d = classerArticle({ source: a.source, titre: a.titre, extrait: a.extrait_court ?? "" });
    if (!d.garder) {
      rejetes.push(a.id);
      continue;
    }
    gardes++;
    const { error: e } = await admin().from("articles")
      .update({ categorie: d.categorie, impact_niveau: d.impact, region: d.region, tickers_lies: d.tickers })
      .eq("id", a.id);
    if (e) throw new Error(`Mise à jour impossible : ${e.message}`);
  }
  for (let i = 0; i < rejetes.length; i += 200) {
    const { error: e } = await admin().from("articles").delete().in("id", rejetes.slice(i, i + 200));
    if (e) throw new Error(`Suppression impossible : ${e.message}`);
  }
  return { message: `${gardes} articles gardés, ${rejetes.length} supprimés par le nouveau filtre.`, details: { gardes, supprimes: rejetes.length } };
}

servirTacheProtegee(async (corps) => {
  if (corps.mode === "reclasser") {
    const r = await executerTache("collecte-rss", reclasser);
    return json(r, r.ok ? 200 : 500);
  }
  const resultat = await executerTache("collecte-rss", async () => {
    const limite = Date.now() - FRAICHEUR_JOURS * 86_400_000;
    const bilan: Record<string, string> = {};
    const retenus: ArticleRetenu[] = [];
    const pannes: string[] = [];

    await Promise.all(Object.entries(FLUX).map(async ([source, url]) => {
      try {
        const reponse = await fetch(url, {
          headers: { "User-Agent": "Deepwater-RSS/1.0 (+https://web-production-c0d8b.up.railway.app)", Accept: "application/rss+xml, application/xml, text/xml" },
          signal: AbortSignal.timeout(20_000),
        });
        if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
        const elements = analyserRss(await reponse.text());
        if (elements.length === 0) throw new Error("flux vide ou illisible");
        let gardes = 0;
        for (const e of elements) {
          if (e.date && e.date.getTime() < limite) continue;
          const decision = classerArticle({ source, titre: e.titre, extrait: e.extrait });
          if (!decision.garder) continue;
          gardes++;
          retenus.push({
            titre: e.titre,
            source,
            url: urlCanonique(e.lien),
            date_publication: (e.date ?? new Date()).toISOString(),
            extrait_court: extraitCourt(e.extrait),
            decision,
          });
        }
        bilan[source] = `${elements.length} lus, ${gardes} retenus`;
      } catch (erreur) {
        const message = erreur instanceof Error ? erreur.message : String(erreur);
        pannes.push(`${source} : ${message}`);
        bilan[source] = `en panne (${message})`;
      }
    }));

    if (pannes.length === Object.keys(FLUX).length) throw new Error(`Tous les flux sont en panne : ${pannes.join(" | ")}`);
    const nouveaux = await enregistrerArticles(retenus);
    const resume = Object.entries(bilan).map(([s, b]) => `${s} : ${b}`).join(" ; ");
    return {
      message: `${nouveaux} nouvel(s) article(s) — ${resume}${pannes.length ? ` — ${pannes.length} flux en panne, ignorés` : ""}`,
      details: { bilan, pannes, nouveaux },
    };
  });
  return json(resultat, resultat.ok ? 200 : 500);
});
