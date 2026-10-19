// Collecte de fondamentaux complémentaires, sources gratuites et officielles :
//   consensus : chiffres publiés face au consensus, lus dans le fil instantané déjà en base
//   bce_yc    : taux de la zone euro (courbe des emprunts d'État AAA de la BCE), 2 et 10 ans
//   cot       : positionnement des gérants d'actifs et des fonds à effet de levier (rapport
//               « Traders in Financial Futures » de la CFTC, hebdomadaire)
// Une source en panne est journalisée sans bloquer les autres collectes.
import { lireCsv } from "../_shared/csv.ts";
import { servirTacheProtegee } from "../_shared/garde.ts";
import { json } from "../_shared/http.ts";
import { executerTache } from "../_shared/journal.ts";
import { enregistrerPrix } from "../_shared/prix.ts";
import { lirePublication } from "../_shared/publications.ts";
import { admin } from "../_shared/supabase.ts";

const ilYa = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------------------- Consensus

async function collecterConsensus(): Promise<string> {
  const { data, error } = await admin().from("articles").select("titre, source, date_publication")
    .eq("type", "squawk").gte("date_publication", new Date(Date.now() - 3 * 86_400_000).toISOString());
  if (error) throw new Error(`Lecture du fil instantané impossible : ${error.message}`);
  const lignes = (data ?? []).flatMap((a) => {
    const p = lirePublication(a.titre);
    return p ? [{ ...p, empreinte: `${a.source}|${a.titre}`, instant: a.date_publication, source: a.source, titre: a.titre }] : [];
  });
  if (lignes.length) {
    const { error: e } = await admin().from("publications_consensus").upsert(lignes, { onConflict: "empreinte", ignoreDuplicates: true });
    if (e) throw new Error(`Écriture du consensus impossible : ${e.message}`);
  }
  return `${(data ?? []).length} éléments du fil lus, ${lignes.length} chiffres avec consensus reconnus`;
}

// ---------------------------------------------------------------------------- Taux zone euro

async function collecterBceYc(): Promise<string> {
  const { data: tickers, error } = await admin().from("tickers_suivis").select("id, symbole, symboles_source").eq("source_principale", "bce_yc").eq("actif_bool", true);
  if (error) throw new Error(`Lecture des instruments impossible : ${error.message}`);
  const parSerie = new Map((tickers ?? []).map((t) => [(t.symboles_source as { bce_yc: string }).bce_yc, t]));
  if (parSerie.size === 0) return "aucun instrument";
  const { count } = await admin().from("prix_historique").select("id", { count: "exact", head: true }).eq("ticker_id", [...parSerie.values()][0].id);
  const depuis = (count ?? 0) >= 200 ? ilYa(30) : ilYa(10 * 366);
  const url = `https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.${[...parSerie.keys()].join("+")}?startPeriod=${depuis}&format=csvdata`;
  const reponse = await fetch(url, { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(60_000) });
  if (!reponse.ok) throw new Error(`BCE : HTTP ${reponse.status}`);
  const points = new Map<string, { date: string; cloture: number }[]>();
  for (const l of lireCsv(await reponse.text())) {
    const valeur = Number(l.OBS_VALUE);
    if (!l.DATA_TYPE_FM || !l.TIME_PERIOD || l.OBS_VALUE === "" || !Number.isFinite(valeur)) continue;
    points.set(l.DATA_TYPE_FM, [...(points.get(l.DATA_TYPE_FM) ?? []), { date: l.TIME_PERIOD, cloture: Math.round(valeur * 10_000) / 10_000 }]);
  }
  const bilan: string[] = [];
  for (const [serie, t] of parSerie) {
    const p = (points.get(serie) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    if (p.length === 0) {
      bilan.push(`${t.symbole} : aucune donnée`);
      continue;
    }
    await enregistrerPrix(t.id, p.map((x) => ({ ...x, ouverture: null, plus_haut: null, plus_bas: null, volume: null })), `bce:YC:${serie}`);
    bilan.push(`${t.symbole} ${p.at(-1)!.cloture} % (${p.at(-1)!.date}), ${p.length} jours`);
  }
  return bilan.join(" ; ");
}

// ---------------------------------------------------------------------------- COT (CFTC)

export const MARCHES_COT: Record<string, string> = {
  "13874A": "S&P 500 (E-mini)", "209742": "Nasdaq-100 (mini)", "043602": "Bon du Trésor 10 ans",
  "099741": "EUR", "096742": "GBP", "097741": "JPY", "092741": "CHF", "090741": "CAD", "232741": "AUD", "112741": "NZD",
};

async function collecterCot(): Promise<string> {
  const { count } = await admin().from("positions_cot").select("date", { count: "exact", head: true });
  const depuis = (count ?? 0) > 100 ? ilYa(60) : ilYa(3 * 366 + 30);
  const params = new URLSearchParams({
    $select: "report_date_as_yyyy_mm_dd,cftc_contract_market_code,open_interest_all,asset_mgr_positions_long,asset_mgr_positions_short,lev_money_positions_long,lev_money_positions_short",
    $where: `cftc_contract_market_code in(${Object.keys(MARCHES_COT).map((c) => `'${c}'`).join(",")}) AND report_date_as_yyyy_mm_dd >= '${depuis}'`,
    $limit: "5000",
    $order: "report_date_as_yyyy_mm_dd",
  });
  const reponse = await fetch(`https://publicreporting.cftc.gov/resource/gpe5-46if.json?${params}`, { signal: AbortSignal.timeout(60_000) });
  if (!reponse.ok) throw new Error(`CFTC : HTTP ${reponse.status}`);
  const brut = await reponse.json() as Record<string, string>[];
  const nombre = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const lignes = brut.flatMap((r) => {
    const code = r.cftc_contract_market_code;
    const valeurs = [r.open_interest_all, r.asset_mgr_positions_long, r.asset_mgr_positions_short, r.lev_money_positions_long, r.lev_money_positions_short].map(nombre);
    if (!MARCHES_COT[code] || valeurs.some((v) => v === null) || !r.report_date_as_yyyy_mm_dd) return [];
    const [interet_ouvert, gerants_long, gerants_court, fonds_long, fonds_court] = valeurs as number[];
    return [{
      date: r.report_date_as_yyyy_mm_dd.slice(0, 10), code, marche: MARCHES_COT[code],
      interet_ouvert, gerants_long, gerants_court, fonds_long, fonds_court, maj_le: new Date().toISOString(),
    }];
  });
  if (lignes.length === 0) throw new Error("CFTC : aucune position reçue.");
  for (let i = 0; i < lignes.length; i += 1000) {
    const { error } = await admin().from("positions_cot").upsert(lignes.slice(i, i + 1000), { onConflict: "date,code" });
    if (error) throw new Error(`Écriture du COT impossible : ${error.message}`);
  }
  return `${lignes.length} lignes, dernier rapport du ${lignes.at(-1)!.date}`;
}

// ---------------------------------------------------------------------------- Point d'entrée

const SOURCES = { consensus: collecterConsensus, bce_yc: collecterBceYc, cot: collecterCot } as const;

servirTacheProtegee(async (corps) => {
  const source = (Object.keys(SOURCES) as (keyof typeof SOURCES)[]).find((s) => s === corps.source);
  if (!source) return json({ ok: false, message: `Source inconnue : ${String(corps.source)}` }, 400);
  const resultat = await executerTache(`collecte-fondamentaux:${source}`, async () => ({ message: await SOURCES[source]() }));
  return json(resultat, resultat.ok ? 200 : 500);
});
