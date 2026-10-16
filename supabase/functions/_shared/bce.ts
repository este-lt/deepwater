// Cours de référence de la BCE (API de données officielle, gratuite, sans clé) :
// une valeur par jour ouvré, publiée vers 16 h, heure de Francfort.
// Les cours sont exprimés en devise pour 1 euro ; les paires contre le dollar en sont déduites.

export type CoursBce = Map<string, Map<string, number>>; // devise -> date -> unités pour 1 EUR

export async function lireCoursBce(devises: string[], depuis: string): Promise<CoursBce> {
  const url = `https://data-api.ecb.europa.eu/service/data/EXR/D.${devises.join("+")}.EUR.SP00.A?startPeriod=${depuis}&format=csvdata`;
  const reponse = await fetch(url, { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(40_000) });
  if (!reponse.ok) throw new Error(`BCE : HTTP ${reponse.status}`);
  const lignes = (await reponse.text()).trim().split(/\r?\n/);
  const entete = lignes[0]?.split(",") ?? [];
  const iDevise = entete.indexOf("CURRENCY");
  const iDate = entete.indexOf("TIME_PERIOD");
  const iValeur = entete.indexOf("OBS_VALUE");
  if (iDevise < 0 || iDate < 0 || iValeur < 0) throw new Error(`BCE : format inattendu (${lignes[0]?.slice(0, 80)})`);
  const cours: CoursBce = new Map();
  for (const ligne of lignes.slice(1)) {
    const c = ligne.split(",");
    const valeur = Number(c[iValeur]);
    if (!c[iDate] || !Number.isFinite(valeur) || valeur <= 0) continue;
    if (!cours.has(c[iDevise])) cours.set(c[iDevise], new Map());
    cours.get(c[iDevise])!.set(c[iDate], valeur);
  }
  if (cours.size === 0) throw new Error("BCE : aucun cours exploitable.");
  return cours;
}

// eur      : EUR/USD = USD pour 1 EUR
// usd_base : USD/XXX = (XXX pour 1 EUR) / (USD pour 1 EUR)
// usd_cote : XXX/USD = (USD pour 1 EUR) / (XXX pour 1 EUR)
export type Calcul = "eur" | "usd_base" | "usd_cote";

export function paire(cours: CoursBce, devise: string, calcul: Calcul): [string, number][] {
  const usd = cours.get("USD");
  const autre = cours.get(devise);
  if (!usd || !autre) return [];
  const points: [string, number][] = [];
  for (const [date, xParEur] of autre) {
    const usdParEur = usd.get(date);
    if (usdParEur === undefined) continue;
    const valeur = calcul === "eur" ? usdParEur : calcul === "usd_base" ? xParEur / usdParEur : usdParEur / xParEur;
    points.push([date, Math.round(valeur * 1e6) / 1e6]);
  }
  return points.sort((a, b) => a[0].localeCompare(b[0]));
}
