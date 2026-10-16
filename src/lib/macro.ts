import "server-only";
import type { ClientSupabase } from "./supabase";
import type { MacroRow, MatiereRow, TauxRow } from "./types-supabase";

export const MATURITES: { cle: TauxRow["maturite"]; libelle: string; annees: number }[] = [
  { cle: "3month", libelle: "3 mois", annees: 0.25 },
  { cle: "2year", libelle: "2 ans", annees: 2 },
  { cle: "5year", libelle: "5 ans", annees: 5 },
  { cle: "7year", libelle: "7 ans", annees: 7 },
  { cle: "10year", libelle: "10 ans", annees: 10 },
  { cle: "30year", libelle: "30 ans", annees: 30 },
];

export interface EtatTaux {
  date: string | null;
  majLe: string | null;
  source: string | null;
  points: { maturite: TauxRow["maturite"]; libelle: string; annees: number; taux: number; variation5j: number | null }[];
  spread102: number | null;
  spread302: number | null;
  historiqueSpread: number[];
}

export async function lireTaux(supabase: ClientSupabase): Promise<EtatTaux> {
  const depuis = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("taux_tresor")
    .select("date, maturite, taux, spread_10_2, spread_30_2, maj_le, source_donnee")
    .gte("date", depuis)
    .order("date", { ascending: true });
  if (error) throw new Error(`Lecture des taux impossible : ${error.message}`);
  const lignes = (data ?? []) as TauxRow[];
  if (lignes.length === 0) {
    return { date: null, majLe: null, source: null, points: [], spread102: null, spread302: null, historiqueSpread: [] };
  }

  const parMaturite = new Map<string, TauxRow[]>();
  for (const l of lignes) parMaturite.set(l.maturite, [...(parMaturite.get(l.maturite) ?? []), l]);
  const date10 = parMaturite.get("10year")?.at(-1)?.date ?? lignes.at(-1)!.date;

  const points = MATURITES.flatMap((m) => {
    const serie = parMaturite.get(m.cle) ?? [];
    const derniere = serie.at(-1);
    if (!derniere) return [];
    const ilYa5 = serie.at(-6);
    return [{
      maturite: m.cle,
      libelle: m.libelle,
      annees: m.annees,
      taux: Number(derniere.taux),
      variation5j: ilYa5 ? Number(derniere.taux) - Number(ilYa5.taux) : null,
    }];
  });

  const parDate = new Map<string, TauxRow>();
  for (const l of parMaturite.get("10year") ?? []) parDate.set(l.date, l);
  const derniereLigne = parDate.get(date10);
  return {
    date: date10,
    majLe: lignes.reduce((max, l) => (l.maj_le > max ? l.maj_le : max), lignes[0].maj_le),
    source: lignes.at(-1)?.source_donnee ?? null,
    points,
    spread102: derniereLigne?.spread_10_2 === null || derniereLigne?.spread_10_2 === undefined ? null : Number(derniereLigne.spread_10_2),
    spread302: derniereLigne?.spread_30_2 === null || derniereLigne?.spread_30_2 === undefined ? null : Number(derniereLigne.spread_30_2),
    historiqueSpread: [...parDate.values()].filter((l) => l.spread_10_2 !== null).map((l) => Number(l.spread_10_2)),
  };
}

export const MATIERES: { nom: string; libelle: string; unite: string }[] = [
  { nom: "WTI", libelle: "Pétrole WTI", unite: "$/baril" },
  { nom: "BRENT", libelle: "Pétrole Brent", unite: "$/baril" },
  { nom: "NATURAL_GAS", libelle: "Gaz naturel", unite: "$/MMBtu" },
  { nom: "COPPER", libelle: "Cuivre", unite: "$/tonne" },
];

export async function lireMatieres(supabase: ClientSupabase): Promise<(MatiereRow | null)[]> {
  return Promise.all(
    MATIERES.map(async (m) => {
      const { data, error } = await supabase
        .from("matieres_premieres")
        .select("*")
        .eq("nom", m.nom)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Lecture de ${m.nom} impossible : ${error.message}`);
      return (data as MatiereRow | null) ?? null;
    }),
  );
}

export interface IndicateurAffiche {
  cle: string;
  libelle: string;
  valeur: string | null;
  detail: string | null;
  date: string | null;
  majLe: string | null;
  tendance: "hausse" | "baisse" | "neutre";
  // Pour un indicateur, "hausse" n'est pas forcément une bonne nouvelle : simple sens de variation.
}

function ecrire(v: number, decimales: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(v);
}

const sens = (delta: number | null): "hausse" | "baisse" | "neutre" =>
  delta === null || Math.abs(delta) < 1e-9 ? "neutre" : delta > 0 ? "hausse" : "baisse";

export async function lireMacro(supabase: ClientSupabase): Promise<IndicateurAffiche[]> {
  const series = await Promise.all(
    ["FEDERAL_FUNDS_RATE", "CPI", "UNEMPLOYMENT", "NONFARM_PAYROLL", "REAL_GDP"].map(async (indicateur) => {
      const { data, error } = await supabase
        .from("indicateurs_macro")
        .select("*")
        .eq("indicateur", indicateur)
        .order("date", { ascending: false })
        .limit(14);
      if (error) throw new Error(`Lecture de ${indicateur} impossible : ${error.message}`);
      return ((data ?? []) as MacroRow[]).map((l) => ({ ...l, valeur: Number(l.valeur) }));
    }),
  );
  const [fed, cpi, chomage, nfp, pib] = series;
  const vide = (cle: string, libelle: string): IndicateurAffiche => ({
    cle, libelle, valeur: null, detail: null, date: null, majLe: null, tendance: "neutre",
  });

  const resultat: IndicateurAffiche[] = [];

  if (fed.length) {
    // Série quotidienne : comparer à la valeur d'il y a ~30 jours.
    const ilYaUnMois = fed.find((l) => Date.parse(fed[0].date) - Date.parse(l.date) >= 28 * 86_400_000);
    resultat.push({
      cle: "FEDERAL_FUNDS_RATE", libelle: "Taux Fed (effectif)", valeur: `${ecrire(fed[0].valeur, 2)} %`,
      detail: ilYaUnMois ? `${ecrire(ilYaUnMois.valeur, 2)} % il y a un mois` : null,
      date: fed[0].date, majLe: fed[0].maj_le, tendance: sens(ilYaUnMois ? fed[0].valeur - ilYaUnMois.valeur : null),
    });
  } else resultat.push(vide("FEDERAL_FUNDS_RATE", "Taux Fed (effectif)"));

  if (cpi.length >= 13) {
    const glissement = (cpi[0].valeur / cpi[12].valeur - 1) * 100;
    const precedent = cpi.length >= 14 ? (cpi[1].valeur / cpi[13].valeur - 1) * 100 : null;
    resultat.push({
      cle: "CPI", libelle: "Inflation (CPI, sur 1 an)", valeur: `${ecrire(glissement, 1)} %`,
      detail: precedent === null ? null : `${ecrire(precedent, 1)} % le mois précédent`,
      date: cpi[0].date, majLe: cpi[0].maj_le, tendance: sens(precedent === null ? null : glissement - precedent),
    });
  } else resultat.push(vide("CPI", "Inflation (CPI, sur 1 an)"));

  if (chomage.length) {
    resultat.push({
      cle: "UNEMPLOYMENT", libelle: "Taux de chômage", valeur: `${ecrire(chomage[0].valeur, 1)} %`,
      detail: chomage[1] ? `${ecrire(chomage[1].valeur, 1)} % le mois précédent` : null,
      date: chomage[0].date, majLe: chomage[0].maj_le, tendance: sens(chomage[1] ? chomage[0].valeur - chomage[1].valeur : null),
    });
  } else resultat.push(vide("UNEMPLOYMENT", "Taux de chômage"));

  if (nfp.length >= 3) {
    // Niveau total en milliers : la création d'emplois du mois est la différence.
    const creation = nfp[0].valeur - nfp[1].valeur;
    const precedente = nfp[1].valeur - nfp[2].valeur;
    resultat.push({
      cle: "NONFARM_PAYROLL", libelle: "Emplois créés (NFP)", valeur: `${creation >= 0 ? "+" : "−"}${ecrire(Math.abs(creation), 0)} k`,
      detail: `${precedente >= 0 ? "+" : "−"}${ecrire(Math.abs(precedente), 0)} k le mois précédent`,
      date: nfp[0].date, majLe: nfp[0].maj_le, tendance: sens(creation - precedente),
    });
  } else resultat.push(vide("NONFARM_PAYROLL", "Emplois créés (NFP)"));

  if (pib.length >= 3) {
    // Croissance trimestrielle annualisée, comme publiée par le BEA.
    const croissance = ((pib[0].valeur / pib[1].valeur) ** 4 - 1) * 100;
    const precedente = ((pib[1].valeur / pib[2].valeur) ** 4 - 1) * 100;
    resultat.push({
      cle: "REAL_GDP", libelle: "Croissance du PIB (annualisée)", valeur: `${ecrire(croissance, 1)} %`,
      detail: `${ecrire(precedente, 1)} % le trimestre précédent`,
      date: pib[0].date, majLe: pib[0].maj_le, tendance: sens(croissance - precedente),
    });
  } else resultat.push(vide("REAL_GDP", "Croissance du PIB (annualisée)"));

  return resultat;
}
