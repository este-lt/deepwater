import "server-only";
import { type Frequence, instantFuseau } from "./format";
import type { Langue } from "./i18n";
import type { ClientSupabase } from "./supabase";
import type { ArticleRow, CalendrierRow, Json } from "./types-supabase";

export interface ArticleAffiche {
  id: number;
  titre: string;
  // Titre d'origine (anglais) quand le titre affiché est une traduction automatique.
  original: string | null;
  source: string;
  url: string;
  date_publication: string;
  extrait_court: string | null;
  impact_niveau: ArticleRow["impact_niveau"];
  categorie: string | null;
  region: string | null;
  tickers_lies: string[];
}

export interface EtatVeille {
  articles: ArticleAffiche[];
  // Dernière lecture réussie des flux (même si aucun élément neuf n'a passé le filtre).
  verifieLe: string | null;
  fenetreJours: number;
}

const FENETRE_JOURS = 7;
const COLONNES = "id, titre, source, url, date_publication, extrait_court, impact_niveau, categorie, region, tickers_lies, traductions";

// Les sources sont en anglais : en français, titre et extrait traduits (MyMemory) s'ils le sont déjà.
function afficher(a: Pick<ArticleRow, "id" | "titre" | "source" | "url" | "date_publication" | "extrait_court" | "impact_niveau" | "categorie" | "region" | "tickers_lies"> & { traductions: Json }, langue: Langue): ArticleAffiche {
  const fr = langue === "fr" ? ((a.traductions as { fr?: { titre?: string; extrait?: string | null } } | null)?.fr ?? null) : null;
  return {
    id: a.id,
    titre: fr?.titre ?? a.titre,
    original: fr?.titre ? a.titre : null,
    source: a.source,
    url: a.url,
    date_publication: a.date_publication,
    extrait_court: fr?.extrait ?? a.extrait_court,
    impact_niveau: a.impact_niveau,
    categorie: a.categorie,
    region: a.region,
    tickers_lies: a.tickers_lies,
  };
}

export async function lireVeille(supabase: ClientSupabase, langue: Langue): Promise<EtatVeille> {
  const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
  const [articles, rss] = await Promise.all([
    supabase.from("articles").select(COLONNES).eq("type", "article").gte("date_publication", depuis)
      .order("date_publication", { ascending: false }).limit(150),
    supabase.rpc("derniere_reussite", { p_tache: "collecte-rss" }),
  ]);
  if (articles.error) throw new Error(`Lecture des actualités impossible : ${articles.error.message}`);
  return { articles: (articles.data ?? []).map((a) => afficher(a, langue)), verifieLe: rss.data ?? null, fenetreJours: FENETRE_JOURS };
}

// Fil instantané (squawks) des dernières 24 heures.
export async function lireSquawks(supabase: ClientSupabase, langue: Langue): Promise<EtatVeille> {
  const depuis = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [squawks, tache] = await Promise.all([
    supabase.from("articles").select(COLONNES).eq("type", "squawk").gte("date_publication", depuis)
      .order("date_publication", { ascending: false }).limit(80),
    supabase.rpc("derniere_reussite", { p_tache: "collecte-rss:squawks" }),
  ]);
  if (squawks.error) throw new Error(`Lecture du fil instantané impossible : ${squawks.error.message}`);
  return { articles: (squawks.data ?? []).map((a) => afficher(a, langue)), verifieLe: tache.data ?? null, fenetreJours: 1 };
}

// Heure officielle d'annonce des décisions : 14 h 00 à New York (Fed), 14 h 15 à Francfort (BCE).
const ANNONCES: Record<string, { heure: string; fuseau: string; banque: string; banqueEn: string }> = {
  FOMC: { heure: "14:00", fuseau: "America/New_York", banque: "Fed", banqueEn: "Fed" },
  BCE: { heure: "14:15", fuseau: "Europe/Berlin", banque: "BCE", banqueEn: "ECB" },
};

export interface Reunion {
  id: number;
  devise: "USD" | "EUR";
  banque: string;
  date: string;
  provisoire: boolean;
  annonceUtc: string;
  source: string;
}

type Unite = "pct" | "milliers";

// Indicateurs publiés détectés par le collecteur (voir supabase/functions/_shared/calendrier.ts).
export const PUBLICATIONS: Record<string, { fr: string; en: string; unite: Unite; frequence: Frequence; signe: boolean }> = {
  CPI: { fr: "Inflation (CPI, sur 1 an)", en: "CPI inflation (y/y)", unite: "pct", frequence: "mois", signe: false },
  CORE_CPI: { fr: "CPI sous-jacent (sur 1 an)", en: "Core CPI (y/y)", unite: "pct", frequence: "mois", signe: false },
  CORE_PCE: { fr: "PCE sous-jacent (sur 1 an)", en: "Core PCE (y/y)", unite: "pct", frequence: "mois", signe: false },
  PPI: { fr: "Prix à la production (sur 1 an)", en: "Producer prices (y/y)", unite: "pct", frequence: "mois", signe: false },
  NONFARM_PAYROLL: { fr: "Emplois créés (NFP)", en: "Nonfarm payrolls", unite: "milliers", frequence: "mois", signe: true },
  UNEMPLOYMENT: { fr: "Taux de chômage", en: "Unemployment rate", unite: "pct", frequence: "mois", signe: false },
  JOBLESS_CLAIMS: { fr: "Inscriptions au chômage", en: "Initial jobless claims", unite: "milliers", frequence: "semaine", signe: false },
  RETAIL_SALES: { fr: "Ventes au détail (sur 1 mois)", en: "Retail sales (m/m)", unite: "pct", frequence: "mois", signe: true },
  REAL_GDP: { fr: "PIB réel (trimestre annualisé)", en: "Real GDP (annualized q/q)", unite: "pct", frequence: "trimestre", signe: false },
};

// Publications à venir suivies par l'API FRED (toutes à 8 h 30, heure de New York).
const PREVUES_EN: Record<string, string> = {
  "REL:CPI": "CPI inflation",
  "REL:EMPLOI": "Employment report (payrolls, unemployment)",
  "REL:PCE": "PCE inflation (personal income and outlays)",
  "REL:PIB": "GDP",
  "REL:PPI": "Producer prices (PPI)",
  "REL:VENTES": "Retail sales",
  "REL:INSCRIPTIONS": "Initial jobless claims",
};

export interface Prevue {
  id: number;
  libelle: string;
  date: string;
  annonceUtc: string;
  impact: CalendrierRow["impact"];
}

export interface Publication {
  id: number;
  indicateur: string;
  libelle: string;
  unite: Unite;
  frequence: Frequence;
  signe: boolean;
  periode: string | null;
  detecteeLe: string;
  // Premier chargement : la date réelle de publication n'est pas connue.
  dateInconnue: boolean;
  valeur: number | null;
  precedente: number | null;
  variation: number | null;
  source: string;
}

// Calendrier mondial (Forex Factory) : heure exacte, consensus et chiffre précédent.
export interface EvenementMondial {
  id: number;
  devise: string;
  libelle: string;
  instant: string;
  impact: CalendrierRow["impact"];
  prevision: string | null;
  precedent: string | null;
  ferie: boolean;
  titreEn: string | null;
}

export interface EtatCalendrier {
  reunions: Reunion[];
  prevues: Prevue[];
  publications: Publication[];
  mondial: EvenementMondial[];
  majLe: string | null;
  mondialMajLe: string | null;
  // Instant de la lecture (ms) : référence « maintenant » pour les pages.
  lu: number;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

export async function lireCalendrier(supabase: ClientSupabase, langue: Langue): Promise<EtatCalendrier> {
  const en = langue === "en";
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const depuisMondial = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [reunions, publications, prevues, mondial] = await Promise.all([
    supabase
      .from("calendrier_economique")
      .select("id, indicateur, libelle, date_evenement, date_estimee, source_donnee")
      .eq("type_evenement", "banque_centrale")
      .gte("date_evenement", hier)
      .order("date_evenement", { ascending: true })
      .limit(8),
    supabase
      .from("calendrier_economique")
      .select("id, indicateur, libelle, date_reference, date_evenement, date_estimee, valeur, valeur_precedente, variation, source_donnee, maj_le")
      .eq("type_evenement", "publication")
      .order("date_evenement", { ascending: false })
      .limit(60),
    supabase
      .from("calendrier_economique")
      .select("id, indicateur, libelle, date_evenement, impact")
      .eq("type_evenement", "publication_prevue")
      .gte("date_evenement", hier)
      .order("date_evenement", { ascending: true })
      .limit(12),
    supabase
      .from("calendrier_economique")
      .select("id, devise, libelle, libelle_en, instant, impact, prevision, precedent, maj_le")
      .eq("type_evenement", "mondial")
      .gte("instant", depuisMondial)
      .order("instant", { ascending: true })
      .limit(200),
  ]);
  for (const r of [reunions, publications, prevues, mondial]) {
    if (r.error) throw new Error(`Lecture du calendrier impossible : ${r.error.message}`);
  }

  // Une réunion reste affichée jusqu'à une heure après l'annonce.
  const maintenant = Date.now();
  const prochaines = ((reunions.data ?? []) as Pick<CalendrierRow, "id" | "indicateur" | "libelle" | "date_evenement" | "date_estimee" | "source_donnee">[])
    .flatMap((r) => {
      const annonce = ANNONCES[r.indicateur];
      if (!annonce) return [];
      const annonceUtc = instantFuseau(r.date_evenement, annonce.heure, annonce.fuseau);
      if (Date.parse(annonceUtc) + 3_600_000 < maintenant) return [];
      return [{
        id: r.id,
        devise: r.indicateur === "FOMC" ? "USD" as const : "EUR" as const,
        banque: en ? annonce.banqueEn : annonce.banque,
        date: r.date_evenement,
        provisoire: r.date_estimee,
        annonceUtc,
        source: r.source_donnee,
      }];
    })
    .slice(0, 5);

  // Dernière publication de chaque indicateur, dans l'ordre d'importance défini ci-dessus.
  const lignes = (publications.data ?? []) as CalendrierRow[];
  const dernieres = Object.entries(PUBLICATIONS).flatMap(([cle, def]) => {
    const l = lignes.find((x) => x.indicateur === cle);
    if (!l) return [];
    return [{
      id: l.id,
      indicateur: cle,
      libelle: en ? def.en : def.fr,
      unite: def.unite,
      frequence: def.frequence,
      signe: def.signe,
      periode: l.date_reference,
      detecteeLe: l.date_evenement,
      dateInconnue: l.date_estimee,
      valeur: num(l.valeur),
      precedente: num(l.valeur_precedente),
      variation: num(l.variation),
      source: l.source_donnee,
    }];
  });

  const aVenir = (prevues.data ?? [])
    .map((p) => ({
      id: p.id,
      libelle: en ? PREVUES_EN[p.indicateur] ?? p.libelle : p.libelle,
      date: p.date_evenement,
      annonceUtc: instantFuseau(p.date_evenement, "08:30", "America/New_York"),
      impact: p.impact,
    }))
    .filter((p) => Date.parse(p.annonceUtc) + 3_600_000 >= maintenant)
    .slice(0, 6);

  const evenements = (mondial.data ?? []).map((e) => ({
    id: e.id,
    devise: e.devise ?? "",
    libelle: en ? e.libelle_en ?? e.libelle : e.libelle,
    instant: e.instant!,
    impact: e.impact,
    prevision: e.prevision,
    precedent: e.precedent,
    ferie: e.libelle_en === "Bank Holiday",
    titreEn: e.libelle_en,
  }));

  return {
    reunions: prochaines,
    prevues: aVenir,
    publications: dernieres,
    mondial: evenements,
    majLe: lignes.reduce<string | null>((max, l) => (max === null || l.maj_le > max ? l.maj_le : max), null),
    lu: maintenant,
    mondialMajLe: (mondial.data ?? []).reduce<string | null>((max, l) => (max === null || l.maj_le > max ? l.maj_le : max), null),
  };
}
