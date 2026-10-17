// Veille : articles (WSJ, FT, CNBC, Fed, BCE ; toutes les 30 minutes) et squawks
// (FinancialJuice, InvestingLive ; toutes les 5 minutes). Seuls les éléments retenus
// par les filtres stricts sont stockés (titre, lien, date, source, extrait court pour
// les articles), puis leurs titres sont traduits en français. Un flux en panne est
// journalisé et ignoré, sans bloquer les autres.
import { enregistrerArticles, type ArticleRetenu, traduireArticles } from "../_shared/articles.ts";
import { classerArticle } from "../_shared/filtre-actualites.ts";
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { analyserRss, type ElementRss, extraitCourt, urlCanonique } from "../_shared/rss.ts";
import { classerSquawk } from "../_shared/squawks.ts";
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

export const SQUAWKS: Record<string, string> = {
  "FinancialJuice": "https://www.financialjuice.com/feed.ashx?xy=rss",
  "InvestingLive": "https://investinglive.com/feed/news",
};

const FRAICHEUR_JOURS = 7;
const FRAICHEUR_SQUAWKS_MS = 24 * 3_600_000;
const CONSERVATION_SQUAWKS_JOURS = 7;

async function lireFlux(url: string): Promise<ElementRss[]> {
  const reponse = await fetch(url, {
    headers: { "User-Agent": "Deepwater-RSS/1.0 (+https://web-production-c0d8b.up.railway.app)", Accept: "application/rss+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
  const elements = analyserRss(await reponse.text());
  if (elements.length === 0) throw new Error("flux vide ou illisible");
  return elements;
}

// Après une modification des règles : repasse les éléments stockés au filtre, supprime
// ceux qui ne passent plus et met à jour la catégorie des autres.
async function reclasser() {
  const { data, error } = await admin().from("articles").select("id, titre, source, extrait_court, type");
  if (error) throw new Error(`Lecture des articles impossible : ${error.message}`);
  const rejetes: number[] = [];
  let gardes = 0;
  for (const a of data ?? []) {
    const d = a.type === "squawk"
      ? classerSquawk(a.titre)
      : classerArticle({ source: a.source, titre: a.titre, extrait: a.extrait_court ?? "" });
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
  return { message: `${gardes} éléments gardés, ${rejetes.length} supprimés par le nouveau filtre.`, details: { gardes, supprimes: rejetes.length } };
}

async function collecter(mode: "articles" | "squawks") {
  const flux = mode === "squawks" ? SQUAWKS : FLUX;
  const limite = Date.now() - (mode === "squawks" ? FRAICHEUR_SQUAWKS_MS : FRAICHEUR_JOURS * 86_400_000);
  const bilan: Record<string, string> = {};
  const retenus: ArticleRetenu[] = [];
  const pannes: string[] = [];

  await Promise.all(Object.entries(flux).map(async ([source, url]) => {
    try {
      const elements = await lireFlux(url);
      let gardes = 0;
      for (const e of elements) {
        if (e.date && e.date.getTime() < limite) continue;
        const date_publication = (e.date ?? new Date()).toISOString();
        if (mode === "squawks") {
          const d = classerSquawk(e.titre);
          if (!d.garder) continue;
          retenus.push({ titre: d.titre, source, url: urlCanonique(e.lien), date_publication, extrait_court: null, decision: d, type: "squawk" });
        } else {
          const d = classerArticle({ source, titre: e.titre, extrait: e.extrait });
          if (!d.garder) continue;
          retenus.push({ titre: e.titre, source, url: urlCanonique(e.lien), date_publication, extrait_court: extraitCourt(e.extrait), decision: d });
        }
        gardes++;
      }
      bilan[source] = `${elements.length} lus, ${gardes} retenus`;
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      pannes.push(`${source} : ${message}`);
      bilan[source] = `en panne (${message})`;
    }
  }));

  if (pannes.length === Object.keys(flux).length) throw new Error(`Tous les flux sont en panne : ${pannes.join(" | ")}`);
  const nouveaux = await enregistrerArticles(retenus);
  if (mode === "squawks") {
    const avant = new Date(Date.now() - CONSERVATION_SQUAWKS_JOURS * 86_400_000).toISOString();
    await admin().from("articles").delete().eq("type", "squawk").lt("date_publication", avant);
  }
  const traduits = await traduireArticles().catch(() => 0);
  const resume = Object.entries(bilan).map(([s, b]) => `${s} : ${b}`).join(" ; ");
  return {
    message: `${nouveaux} nouveau(x), ${traduits} traduit(s) — ${resume}${pannes.length ? ` — ${pannes.length} flux en panne, ignorés` : ""}`,
    details: { bilan, pannes, nouveaux, traduits },
  };
}

servirTacheProtegee(async (corps) => {
  if (corps.mode === "reclasser") {
    const r = await executerTache("collecte-rss", reclasser);
    return json(r, r.ok ? 200 : 500);
  }
  const mode = corps.mode === "squawks" ? "squawks" : "articles";
  const resultat = await executerTache(mode === "squawks" ? "collecte-rss:squawks" : "collecte-rss", () => collecter(mode));
  return json(resultat, resultat.ok ? 200 : 500);
});
