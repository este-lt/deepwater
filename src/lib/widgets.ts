// Widgets du tableau de bord : ordre, visibilité et largeur choisis par chaque
// utilisateur (parametres_utilisateur.disposition). Utilisable serveur et navigateur.

export const WIDGETS = [
  { id: "indices", fr: "Indices prioritaires", en: "Key indices", large: true },
  { id: "biais", fr: "Biais du jour (S&P 500, Nasdaq-100)", en: "Daily bias (S&P 500, Nasdaq-100)", large: true },
  { id: "performance", fr: "Performance du biais et régimes", en: "Bias track record and regimes", large: true },
  { id: "anticipations", fr: "Anticipations de taux (Fed, zone euro)", en: "Rate expectations (Fed, euro area)", large: false },
  { id: "liquidite", fr: "Liquidité de la Fed et positionnement (COT)", en: "Fed liquidity and positioning (COT)", large: false },
  { id: "regime", fr: "Régime de marché et corrélations", en: "Market regime and correlations", large: false },
  { id: "devises", fr: "Force des devises et paires", en: "Currency strength and pairs", large: false },
  { id: "moniteur", fr: "Marchés", en: "Markets", large: true },
  { id: "graphique", fr: "Graphique", en: "Chart", large: true },
  { id: "squawks", fr: "Fil instantané", en: "Live squawk", large: false },
  { id: "consensus", fr: "Chiffres face au consensus", en: "Releases vs consensus", large: false },
  { id: "calendrier", fr: "Calendrier économique", en: "Economic calendar", large: false },
  { id: "banques", fr: "Banques centrales et macro mondiale", en: "Central banks and global macro", large: true },
  { id: "actualites", fr: "Actualités", en: "News", large: false },
  { id: "taux", fr: "Courbe des taux", en: "Yield curve", large: false },
  { id: "macro", fr: "Macroéconomie américaine", en: "US macro", large: false },
] as const;

export type IdWidget = (typeof WIDGETS)[number]["id"];

export interface Disposition {
  ordre: IdWidget[];
  masques: IdWidget[];
  larges: IdWidget[];
}

const IDS = WIDGETS.map((w) => w.id) as IdWidget[];
const estId = (v: unknown): v is IdWidget => typeof v === "string" && (IDS as string[]).includes(v);

export const DISPOSITION_DEFAUT: Disposition = {
  ordre: IDS,
  masques: [],
  larges: WIDGETS.filter((w) => w.large).map((w) => w.id),
};

// Disposition enregistrée, complétée par les widgets ajoutés depuis (à leur place par défaut).
export function dispositionValide(brut: unknown): Disposition {
  const d = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const ordre = Array.isArray(d.ordre) ? [...new Set(d.ordre.filter(estId))] : [];
  for (const id of IDS) {
    if (ordre.includes(id)) continue;
    const avant = IDS.slice(0, IDS.indexOf(id)).reverse().find((x) => ordre.includes(x));
    ordre.splice(avant ? ordre.indexOf(avant) + 1 : 0, 0, id);
  }
  return {
    ordre,
    masques: Array.isArray(d.masques) ? [...new Set(d.masques.filter(estId))] : [],
    larges: Array.isArray(d.larges) ? [...new Set(d.larges.filter(estId))] : DISPOSITION_DEFAUT.larges,
  };
}
