// Calendrier économique mondial de Forex Factory (flux public de la semaine en cours) :
// heure exacte, impact, consensus (« forecast ») et chiffre précédent. Pas de chiffre
// publié (« actual ») dans ce flux. Impact faible ignoré (bruit), jours fériés gardés
// (liquidité réduite).

export interface EvenementFF {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

export interface EvenementMondial {
  devise: string;
  titre: string; // anglais d'origine
  libelle: string; // français
  instant: string; // ISO UTC
  impact: "fort" | "moyen" | "faible";
  prevision: string | null;
  precedent: string | null;
}

export const URL_FF = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const DEVISES_SUIVIES = new Set(["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "CNY"]);
const IMPACTS: Record<string, EvenementMondial["impact"]> = { High: "fort", Medium: "moyen", Holiday: "faible" };

// Intervenants : « ECB President Lagarde Speaks » -> « Discours de Lagarde (présidente de la BCE) ».
const ROLES: [RegExp, string][] = [
  [/^Fed Chairman$/, "président de la Fed"],
  [/^Fed Vice Chair(man)?( for Supervision)?$/, "vice-président de la Fed"],
  [/^FOMC Member$/, "membre du FOMC"],
  [/^ECB President$/, "présidente de la BCE"],
  [/^ECB Vice President$/, "vice-président de la BCE"],
  [/^ECB Chief Economist$/, "chef économiste de la BCE"],
  [/^(German )?Buba President$/, "président de la Bundesbank"],
  [/^BOE Gov$/, "gouverneur de la BoE"],
  [/^MPC Member$/, "membre du comité de la BoE"],
  [/^BOJ Gov$/, "gouverneur de la BoJ"],
  [/^SNB Chairman$/, "président de la BNS"],
  [/^BOC Gov$/, "gouverneur de la BoC"],
  [/^RBA Gov$/, "gouverneure de la RBA"],
  [/^RBA Deputy Gov$/, "sous-gouverneur de la RBA"],
  [/^RBNZ Gov$/, "gouverneur de la RBNZ"],
  [/^President$/, "président"],
  [/^Treasury Sec(retary)?$/, "secrétaire au Trésor"],
];

// Expressions courantes, de la plus longue à la plus courte.
const GLOSSAIRE: [RegExp, string][] = [
  [/^Bank Holiday$/, "Jour férié"],
  [/^Non-Farm Employment Change$/, "Créations d'emplois non agricoles (NFP)"],
  [/^ADP Non-Farm Employment Change$/, "Emploi privé ADP"],
  [/^Average Hourly Earnings$/, "Salaire horaire moyen"],
  [/^Unemployment Claims$/, "Inscriptions au chômage"],
  [/^Unemployment Rate$/, "Taux de chômage"],
  [/^Employment Change$/, "Variation de l'emploi"],
  [/^Claimant Count Change$/, "Demandeurs d'allocations chômage"],
  [/^JOLTS Job Openings$/, "Offres d'emploi (JOLTS)"],
  [/^Core PCE Price Index$/, "Inflation PCE sous-jacente"],
  [/^Core CPI$/, "Inflation sous-jacente (CPI)"],
  [/^Trimmed Mean CPI$/, "Inflation moyenne tronquée"],
  [/^Median CPI$/, "Inflation médiane"],
  [/^Tokyo Core CPI$/, "Inflation sous-jacente de Tokyo"],
  [/^National Core CPI$/, "Inflation sous-jacente nationale"],
  [/^Core CPI Flash Estimate$/, "Inflation sous-jacente (estimation flash)"],
  [/^CPI Flash Estimate$/, "Inflation (estimation flash)"],
  [/^Prelim CPI$/, "Inflation (préliminaire)"],
  [/^CPI$/, "Inflation (CPI)"],
  [/^Core PPI$/, "Prix à la production sous-jacents"],
  [/^PPI$/, "Prix à la production"],
  [/^Core Retail Sales$/, "Ventes au détail hors automobile"],
  [/^Retail Sales$/, "Ventes au détail"],
  [/^Advance GDP$/, "PIB (première estimation)"],
  [/^Prelim GDP$/, "PIB (estimation préliminaire)"],
  [/^Final GDP$/, "PIB (estimation définitive)"],
  [/^GDP$/, "PIB"],
  [/^Flash Manufacturing PMI$/, "PMI manufacturier (flash)"],
  [/^Flash Services PMI$/, "PMI services (flash)"],
  [/^ISM Manufacturing PMI$/, "ISM manufacturier"],
  [/^ISM Services PMI$/, "ISM services"],
  [/^Manufacturing PMI$/, "PMI manufacturier"],
  [/^Services PMI$/, "PMI services"],
  [/^Federal Funds Rate$/, "Décision de taux de la Fed"],
  [/^Main Refinancing Rate$/, "Décision de taux de la BCE"],
  [/^Official Bank Rate$/, "Décision de taux de la BoE"],
  [/^BOJ Policy Rate$/, "Décision de taux de la BoJ"],
  [/^SNB Policy Rate$/, "Décision de taux de la BNS"],
  [/^Overnight Rate$/, "Décision de taux de la BoC"],
  [/^Cash Rate$/, "Décision de taux de la RBA"],
  [/^Official Cash Rate$/, "Décision de taux de la RBNZ"],
  [/^FOMC Statement$/, "Communiqué du FOMC"],
  [/^FOMC Press Conference$/, "Conférence de presse du FOMC"],
  [/^FOMC Meeting Minutes$/, "Compte rendu du FOMC"],
  [/^FOMC Economic Projections$/, "Projections économiques du FOMC"],
  [/^ECB Press Conference$/, "Conférence de presse de la BCE"],
  [/^Monetary Policy Statement$/, "Communiqué de politique monétaire"],
  [/^Monetary Policy Report$/, "Rapport de politique monétaire"],
  [/^BOJ Press Conference$/, "Conférence de presse de la BoJ"],
  [/^BOC Press Conference$/, "Conférence de presse de la BoC"],
  [/^SNB Press Conference$/, "Conférence de presse de la BNS"],
  [/^RBA Press Conference$/, "Conférence de presse de la RBA"],
  [/^RBNZ Press Conference$/, "Conférence de presse de la RBNZ"],
  [/^MPC Official Bank Rate Votes$/, "Votes du comité de la BoE"],
  [/^Monetary Policy Summary$/, "Résumé de politique monétaire"],
  [/^Prelim UoM Consumer Sentiment$/, "Confiance des consommateurs Michigan (préliminaire)"],
  [/^Prelim UoM Inflation Expectations$/, "Anticipations d'inflation Michigan (préliminaire)"],
  [/^Revised UoM Consumer Sentiment$/, "Confiance des consommateurs Michigan (révisée)"],
  [/^Revised UoM Inflation Expectations$/, "Anticipations d'inflation Michigan (révisées)"],
  [/^CB Consumer Confidence$/, "Confiance des consommateurs (Conference Board)"],
  [/^Philly Fed Manufacturing Index$/, "Indice manufacturier de la Fed de Philadelphie"],
  [/^Empire State Manufacturing Index$/, "Indice manufacturier Empire State"],
  [/^German ifo Business Climate$/, "Climat des affaires ifo (Allemagne)"],
  [/^German ZEW Economic Sentiment$/, "Moral économique ZEW (Allemagne)"],
  [/^Trade Balance$/, "Balance commerciale"],
  [/^Current Account$/, "Balance courante"],
  [/^Building Permits$/, "Permis de construire"],
  [/^Housing Starts$/, "Mises en chantier"],
  [/^Existing Home Sales$/, "Ventes de logements anciens"],
  [/^New Home Sales$/, "Ventes de logements neufs"],
  [/^Pending Home Sales$/, "Promesses de ventes de logements"],
  [/^Durable Goods Orders$/, "Commandes de biens durables"],
  [/^Core Durable Goods Orders$/, "Commandes de biens durables hors transport"],
  [/^Industrial Production$/, "Production industrielle"],
  [/^Crude Oil Inventories$/, "Stocks de pétrole brut"],
  [/^Natural Gas Storage$/, "Stocks de gaz naturel"],
  [/^Wage Price Index$/, "Indice des salaires"],
  [/^Labor Cost Index$/, "Indice du coût du travail"],
  [/^Employment Cost Index$/, "Indice du coût de l'emploi"],
  [/^Consumer Confidence$/, "Confiance des consommateurs"],
  [/^Business Confidence$/, "Confiance des entreprises"],
  [/^Tankan Manufacturing Index$/, "Tankan manufacturier"],
  [/^Tankan Non-Manufacturing Index$/, "Tankan non manufacturier"],
  [/^EU Economic Summit$/, "Sommet européen"],
  [/^G7 Meetings$/, "Réunions du G7"],
  [/^G20 Meetings$/, "Réunions du G20"],
  [/^IMF Meetings$/, "Réunions du FMI"],
  [/^OPEC(-JMMC)? Meetings$/, "Réunions de l'OPEP"],
  [/^Federal Budget Balance$/, "Solde budgétaire fédéral"],
  [/^Treasury Currency Report$/, "Rapport du Trésor sur les changes"],
];

const PERIODES: [RegExp, string][] = [[/ m\/m$/, " (sur 1 mois)"], [/ q\/q$/, " (sur 1 trimestre)"], [/ y\/y$/, " (sur 1 an)"], [/ 3m\/y$/, " (3 mois sur 1 an)"]];

// Traduction par glossaire ; null si le titre n'est pas couvert (traduction automatique ensuite).
export function traduireTitre(titre: string): string | null {
  let base = titre.trim();
  let suffixe = "";
  for (const [motif, francais] of PERIODES) {
    if (motif.test(base)) {
      base = base.replace(motif, "");
      suffixe = francais;
      break;
    }
  }
  const discours = base.match(/^(.+?) ([A-Z][\w'-]+) (Speaks|Testifies)$/);
  if (discours) {
    const role = ROLES.find(([m]) => m.test(discours[1]))?.[1];
    if (!role) return null;
    return `${discours[3] === "Testifies" ? "Audition" : "Discours"} de ${discours[2]} (${role})${suffixe}`;
  }
  for (const [motif, francais] of GLOSSAIRE) {
    if (motif.test(base)) return `${base.replace(motif, francais)}${suffixe}`;
  }
  // « German Prelim CPI » : pays + statistique couverte par le glossaire.
  const pays = base.match(/^(German|French|Italian|Spanish) (.+)$/);
  if (pays) {
    const traduit = traduireTitre(pays[2]);
    return traduit ? `${traduit} (${PAYS[pays[1]]})${suffixe}` : null;
  }
  return null;
}

const PAYS: Record<string, string> = { German: "Allemagne", French: "France", Italian: "Italie", Spanish: "Espagne" };

const texteOuNul = (v?: string) => (v && v.trim() ? v.trim() : null);

export function analyserCalendrier(evenements: EvenementFF[]): EvenementMondial[] {
  const resultat: EvenementMondial[] = [];
  for (const e of evenements) {
    const impact = IMPACTS[e.impact];
    const instant = new Date(e.date);
    if (!impact || !DEVISES_SUIVIES.has(e.country) || Number.isNaN(instant.getTime())) continue;
    if (e.country === "CNY" && impact !== "fort") continue;
    resultat.push({
      devise: e.country,
      titre: e.title.trim(),
      libelle: traduireTitre(e.title) ?? e.title.trim(),
      instant: instant.toISOString(),
      impact,
      prevision: texteOuNul(e.forecast),
      precedent: texteOuNul(e.previous),
    });
  }
  return resultat.sort((a, b) => a.instant.localeCompare(b.instant));
}
