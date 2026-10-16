import "server-only";
import { instantFuseau } from "./format";
import type { ClientSupabase } from "./supabase";
import type { ArticleRow, CalendrierRow } from "./types-supabase";

export type ArticleAffiche = Pick<
  ArticleRow,
  "id" | "titre" | "source" | "url" | "date_publication" | "extrait_court" | "impact_niveau" | "categorie" | "region" | "tickers_lies"
>;

export interface EtatVeille {
  articles: ArticleAffiche[];
  // Dernière lecture réussie des flux RSS (même si aucun article neuf n'a passé le filtre).
  verifieLe: string | null;
  fenetreJours: number;
}

const FENETRE_JOURS = 7;

export async function lireVeille(supabase: ClientSupabase): Promise<EtatVeille> {
  const depuis = new Date(Date.now() - FENETRE_JOURS * 86_400_000).toISOString();
  const [articles, rss] = await Promise.all([
    supabase
      .from("articles")
      .select("id, titre, source, url, date_publication, extrait_court, impact_niveau, categorie, region, tickers_lies")
      .gte("date_publication", depuis)
      .order("date_publication", { ascending: false })
      .limit(150),
    supabase.rpc("derniere_reussite", { p_tache: "collecte-rss" }),
  ]);
  if (articles.error) throw new Error(`Lecture des actualités impossible : ${articles.error.message}`);
  return { articles: articles.data ?? [], verifieLe: rss.data ?? null, fenetreJours: FENETRE_JOURS };
}

// Heure officielle d'annonce des décisions : 14 h 00 à New York (Fed), 14 h 15 à Francfort (BCE).
const ANNONCES: Record<string, { heure: string; fuseau: string; banque: string }> = {
  FOMC: { heure: "14:00", fuseau: "America/New_York", banque: "Fed" },
  BCE: { heure: "14:15", fuseau: "Europe/Berlin", banque: "BCE" },
};

export interface Reunion {
  id: number;
  banque: string;
  libelle: string;
  date: string;
  provisoire: boolean;
  annonceUtc: string;
  source: string;
}

type Unite = "pct" | "milliers";

// Indicateurs publiés détectés par le collecteur (voir supabase/functions/_shared/calendrier.ts).
export const PUBLICATIONS: Record<string, { libelle: string; unite: Unite }> = {
  CPI: { libelle: "Inflation (CPI, sur 1 an)", unite: "pct" },
  UNEMPLOYMENT: { libelle: "Taux de chômage", unite: "pct" },
  NONFARM_PAYROLL: { libelle: "Emplois non agricoles (variation mensuelle)", unite: "milliers" },
  REAL_GDP: { libelle: "PIB réel (trimestre annualisé)", unite: "pct" },
};

export interface Publication {
  id: number;
  indicateur: string;
  libelle: string;
  unite: Unite;
  periode: string | null;
  detecteeLe: string;
  // Premier chargement : la date réelle de publication n'est pas connue.
  dateInconnue: boolean;
  valeur: number | null;
  precedente: number | null;
  variation: number | null;
  source: string;
}

export interface EtatCalendrier {
  reunions: Reunion[];
  publications: Publication[];
  majLe: string | null;
}

const num = (v: number | string | null) => (v === null ? null : Number(v));

export async function lireCalendrier(supabase: ClientSupabase): Promise<EtatCalendrier> {
  const hier = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [reunions, publications] = await Promise.all([
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
      .limit(40),
  ]);
  if (reunions.error) throw new Error(`Lecture du calendrier impossible : ${reunions.error.message}`);
  if (publications.error) throw new Error(`Lecture des publications impossible : ${publications.error.message}`);

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
        banque: annonce.banque,
        libelle: r.libelle,
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
      libelle: def.libelle,
      unite: def.unite,
      periode: l.date_reference,
      detecteeLe: l.date_evenement,
      dateInconnue: l.date_estimee,
      valeur: num(l.valeur),
      precedente: num(l.valeur_precedente),
      variation: num(l.variation),
      source: l.source_donnee,
    }];
  });

  return {
    reunions: prochaines,
    publications: dernieres,
    majLe: lignes.reduce<string | null>((max, l) => (max === null || l.maj_le > max ? l.maj_le : max), null),
  };
}
