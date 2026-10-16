// Déclarations 13F (positions des gestionnaires de plus de 100 M$) : pour chaque
// institution suivie, les deux derniers trimestres déclarés, restreints aux
// entreprises suivies, avec la variation du nombre d'actions d'un trimestre à l'autre.
import { cik10, requeteSec } from "../_shared/sec.ts";
import { admin } from "../_shared/supabase.ts";

interface EntrepriseCible {
  symbole: string;
  cusip6: string;
  mot_cle_13f: string;
}

interface Depot13F {
  numero: string;
  dateDepot: string;
  periode: string;
}

const balise = (xml: string, nom: string): string | null =>
  xml.match(new RegExp(`<(?:\\w+:)?${nom}>([\\s\\S]*?)</(?:\\w+:)?${nom}>`))?.[1]?.trim() ?? null;

// Somme des actions détenues par entreprise suivie (plusieurs lignes possibles par
// émetteur : gestionnaires ou mandats différents). Les options (putCall) sont exclues.
export function analyserTableau13F(
  xml: string,
  cibles: EntrepriseCible[],
): { positions: Map<string, { parts: number; valeur: number }>; anomalies: string[] } {
  const positions = new Map<string, { parts: number; valeur: number }>();
  const anomalies: string[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?infoTable>([\s\S]*?)<\/(?:\w+:)?infoTable>/g)) {
    const ligne = m[1];
    if (balise(ligne, "putCall")) continue;
    const cusip = (balise(ligne, "cusip") ?? "").toUpperCase();
    const cible = cibles.find((c) => cusip.startsWith(c.cusip6));
    if (!cible) continue;
    const emetteur = (balise(ligne, "nameOfIssuer") ?? "").toUpperCase();
    if (!emetteur.includes(cible.mot_cle_13f)) {
      anomalies.push(`${cusip} « ${emetteur} » ne correspond pas à ${cible.symbole}`);
      continue;
    }
    if ((balise(ligne, "sshPrnamtType") ?? "SH").toUpperCase() !== "SH") continue;
    const parts = Number(balise(ligne, "sshPrnamt") ?? "0");
    const valeur = Number(balise(ligne, "value") ?? "0");
    const actuel = positions.get(cible.symbole) ?? { parts: 0, valeur: 0 };
    positions.set(cible.symbole, {
      parts: actuel.parts + (Number.isFinite(parts) ? parts : 0),
      valeur: actuel.valeur + (Number.isFinite(valeur) ? valeur : 0),
    });
  }
  return { positions, anomalies };
}

async function derniers13F(cik: string, nombre: number): Promise<Depot13F[]> {
  const s = await (await requeteSec(`https://data.sec.gov/submissions/CIK${cik10(cik)}.json`)).json() as {
    filings: { recent: { form: string[]; accessionNumber: string[]; filingDate: string[]; reportDate: string[] } };
  };
  const r = s.filings.recent;
  const depots: Depot13F[] = [];
  for (let i = 0; i < r.form.length && depots.length < nombre; i++) {
    if (r.form[i] !== "13F-HR") continue;
    if (depots.some((d) => d.periode === r.reportDate[i])) continue; // garde le plus récent par trimestre
    depots.push({ numero: r.accessionNumber[i], dateDepot: r.filingDate[i], periode: r.reportDate[i] });
  }
  return depots;
}

async function lireTableau(cik: string, numero: string): Promise<string> {
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${numero.replace(/-/g, "")}`;
  const index = await (await requeteSec(`${base}/index.json`)).json() as { directory: { item: { name: string }[] } };
  const fichier = index.directory.item.find((i) => i.name.toLowerCase().endsWith(".xml") && !/primary_doc/i.test(i.name));
  if (!fichier) throw new Error(`tableau d'informations introuvable dans ${numero}`);
  return await (await requeteSec(`${base}/${fichier.name}`)).text();
}

export async function collecter13F(): Promise<{ institutions: number; lignes: number; anomalies: string[]; erreurs: string[] }> {
  const [{ data: institutions, error: e1 }, { data: cibles, error: e2 }] = await Promise.all([
    admin().from("institutions_suivies").select("cik, nom").eq("actif", true),
    admin().from("entreprises_suivies_sec").select("symbole, cusip6, mot_cle_13f").eq("actif", true),
  ]);
  if (e1 || e2) throw new Error(`Lecture des listes suivies impossible : ${(e1 ?? e2)?.message}`);

  let lignesEcrites = 0;
  const anomalies: string[] = [];
  const erreurs: string[] = [];
  for (const inst of institutions ?? []) {
    try {
      const [courant, precedent] = await derniers13F(inst.cik, 2);
      if (!courant) continue;
      const actuel = analyserTableau13F(await lireTableau(inst.cik, courant.numero), cibles ?? []);
      const avant = precedent ? analyserTableau13F(await lireTableau(inst.cik, precedent.numero), cibles ?? []) : null;
      anomalies.push(...actuel.anomalies.map((a) => `${inst.nom} : ${a}`));

      const symboles = new Set([...actuel.positions.keys(), ...(avant?.positions.keys() ?? [])]);
      const lignes = [...symboles].map((symbole) => {
        const maintenant = actuel.positions.get(symbole) ?? { parts: 0, valeur: 0 };
        const auparavant = avant ? (avant.positions.get(symbole)?.parts ?? 0) : null;
        return {
          entreprise: symbole,
          institution: inst.nom,
          cik_institution: inst.cik,
          nombre_parts: maintenant.parts,
          valeur_usd: maintenant.valeur,
          variation_trimestre: auparavant === null ? null : maintenant.parts - auparavant,
          date_rapport: courant.periode,
          date_depot: courant.dateDepot,
          numero_acces: courant.numero,
        };
      });
      if (lignes.length) {
        const { error } = await admin().from("positions_institutionnelles").upsert(lignes, { onConflict: "cik_institution,entreprise,date_rapport" });
        if (error) throw new Error(error.message);
        lignesEcrites += lignes.length;
      }
    } catch (e) {
      erreurs.push(`${inst.nom} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { institutions: (institutions ?? []).length, lignes: lignesEcrites, anomalies, erreurs };
}
