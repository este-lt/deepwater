import Link from "next/link";
import type { ReactNode } from "react";
import { Carte, Pastille } from "@/components/carte";
import { Avertissement, EnTete } from "@/components/en-tete";
import { DateLocale, HeureLocale } from "@/components/horodatage";
import { CATEGORIES } from "@/components/veille/fil-actualites";
import type { Composante } from "@/lib/analyse";
import { lireBiais } from "@/lib/biais";
import { formaterDateSeance, formaterNombre, formaterPb, formaterPct } from "@/lib/format";
import { localeDe, traducteur } from "@/lib/i18n";
import { lireMarches, type LigneMarche, nomInstrument } from "@/lib/marches";
import { BANQUES, lireAnalyses, lireMonde } from "@/lib/monde";
import { lirePreferences } from "@/lib/preferences";
import { assurerProfil } from "@/lib/profil";
import { CLASSES } from "@/lib/sources";
import { supabaseUtilisateur } from "@/lib/supabase";
import { lireCalendrier, lireSquawks } from "@/lib/veille";

export async function generateMetadata() {
  const t = traducteur((await lirePreferences()).langue);
  return { title: `${t("Rapport", "Report")} · Deepwater` };
}

function Section({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-discret">{titre}</h2>
      {children}
    </section>
  );
}

const NOMS_COMPOSANTES: Record<Composante["cle"], [string, string]> = {
  actions: ["S&P 500", "S&P 500"],
  volatilite: ["VIX", "VIX"],
  credit: ["spread haut rendement", "high-yield spread"],
  audjpy: ["AUD/JPY", "AUD/JPY"],
  franc: ["USD/CHF", "USD/CHF"],
  or: ["or", "gold"],
};

export default async function PageRapport({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const etat = await assurerProfil();
  const { langue } = await lirePreferences();
  const t = traducteur(langue);
  const en = langue === "en";
  const hebdo = (await searchParams).periode === "hebdo";

  const supabase = await supabaseUtilisateur();
  const [marches, monde, calendrier, squawks, biais] = await Promise.all([
    lireMarches(supabase),
    lireMonde(supabase),
    lireCalendrier(supabase, langue),
    lireSquawks(supabase, langue),
    lireBiais(supabase),
  ]);
  const analyses = await lireAnalyses(supabase, monde);
  const { regime, forces, paires } = analyses;

  const maintenant = calendrier.lu;
  const pct = (v: number | null, d = 1) => formaterPct(v, d, true, langue);

  // ---------------------------------------------------------------- Synthèse (phrases générées par règles)
  const phrases: string[] = [];
  if (regime.score !== null) {
    const principales = [...regime.composantes]
      .filter((c) => c.note !== null && c.valeur !== null)
      .sort((a, b) => Math.abs(b.note! * b.poids) - Math.abs(a.note! * a.poids))
      .slice(0, 3)
      .map((c) => `${NOMS_COMPOSANTES[c.cle][en ? 1 : 0]} ${c.unite === "pct" ? pct(c.valeur) : c.unite === "pb" ? formaterPb(c.valeur, langue) : `${c.valeur! > 0 ? "+" : "−"}${formaterNombre(Math.abs(c.valeur!), 1, langue)} pt`}`);
    const nom = regime.etat === "risk-on" ? "risk-on" : regime.etat === "risk-off" ? "risk-off" : t("neutre", "neutral");
    phrases.push(
      t(
        `Régime de marché ${nom} (score ${Math.round(regime.score * 100)}) sur 5 séances : ${principales.join(", ")}.`,
        `Market regime ${nom} (score ${Math.round(regime.score * 100)}) over 5 sessions: ${principales.join(", ")}.`,
      ),
    );
  }
  if (biais.courants.length) {
    const lib = { haussier: t("haussier", "bullish"), baissier: t("baissier", "bearish"), neutre: t("neutre", "neutral") };
    phrases.push(
      `${t("Biais du jour :", "Daily bias:")} ${biais.courants.map((b) => `${b.nom} ${lib[b.biais]} (${Math.round(b.score * 100)})`).join(en ? "; " : " ; ")}.`,
    );
  }
  const valides = forces.filter((f) => f.score !== null);
  if (valides.length >= 4) {
    phrases.push(
      t(
        `Devises les plus fortes : ${valides.slice(0, 2).map((f) => f.devise).join(", ")} ; les plus faibles : ${valides.slice(-2).map((f) => f.devise).join(", ")}.`,
        `Strongest currencies: ${valides.slice(0, 2).map((f) => f.devise).join(", ")}; weakest: ${valides.slice(-2).map((f) => f.devise).join(", ")}.`,
      ),
    );
  }
  const etoilees = paires.filter((p) => p.etoiles >= 4);
  if (etoilees.length) {
    phrases.push(
      t(
        `Paires à forte confluence : ${etoilees.map((p) => `${p.paire} (${p.sens === "achat" ? "acheteur" : "vendeur"}, ${p.etoiles}★)`).join(", ")}.`,
        `High-confluence pairs: ${etoilees.map((p) => `${p.paire} (${p.sens === "achat" ? "long" : "short"}, ${p.etoiles}★)`).join(", ")}.`,
      ),
    );
  }
  const couverture = analyses.couvertures[0];
  if (couverture && couverture.correlation <= -0.2) {
    const noms = { or: t("l'or", "gold"), yen: t("le yen", "the yen"), franc: t("le franc suisse", "the Swiss franc"), obligations: t("les obligations du Trésor", "Treasuries") };
    phrases.push(
      t(
        `Couverture des actions la plus efficace sur 60 séances : ${noms[couverture.cle]} (corrélation ${formaterNombre(couverture.correlation, 2, langue)}).`,
        `Most effective equity hedge over 60 sessions: ${noms[couverture.cle]} (correlation ${formaterNombre(couverture.correlation, 2, langue)}).`,
      ),
    );
  }

  // ---------------------------------------------------------------- Banques centrales : décisions récentes
  const fenetreDecisions = hebdo ? 30 : 7;
  const recentes = monde.lignes.filter((l) => l.depuis && maintenant - Date.parse(l.depuis) <= fenetreDecisions * 86_400_000 && l.dernierPb !== null);

  // ---------------------------------------------------------------- Agenda
  const agenda = calendrier.mondial.filter(
    (e) => !e.ferie && Date.parse(e.instant) >= maintenant - 3_600_000 && (hebdo ? e.impact === "fort" : e.impact !== "faible" && Date.parse(e.instant) <= maintenant + 24 * 3_600_000),
  );

  // ---------------------------------------------------------------- Mouvements
  const variation = (l: LigneMarche) => (hebdo ? l.var1s : l.var1j);
  const mouvements = marches
    .filter((l) => l.variation === "pct" && variation(l) !== null)
    .sort((a, b) => Math.abs(variation(b)!) - Math.abs(variation(a)!))
    .slice(0, hebdo ? 12 : 8);
  const tauxBouges = marches.filter((l) => l.classe === "taux" && variation(l) !== null);

  const forts = squawks.articles.filter((s) => s.impact_niveau === "fort").slice(0, hebdo ? 0 : 10);
  const titre = hebdo ? t("Rapport hebdomadaire", "Weekly report") : t("Rapport quotidien", "Daily report");
  const dateRapport = new Intl.DateTimeFormat(localeDe(langue), { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());

  return (
    <>
      <EnTete estAdmin={etat.etat === "ok" && etat.profil.role === "admin"} />
      <main className="mx-auto flex max-w-[60rem] flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{titre}</h1>
            <p className="text-sm capitalize text-attenue">{dateRapport}</p>
          </div>
          <nav className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
            <Link href="/rapport" className={`rounded-lg px-3 py-1.5 ${hebdo ? "text-attenue hover:text-texte" : "bg-surface-3 font-medium"}`}>{t("Quotidien", "Daily")}</Link>
            <Link href="/rapport?periode=hebdo" className={`rounded-lg px-3 py-1.5 ${hebdo ? "bg-surface-3 font-medium" : "text-attenue hover:text-texte"}`}>{t("Hebdomadaire", "Weekly")}</Link>
          </nav>
        </div>

        <Carte titre={t("Synthèse", "Summary")}>
          {phrases.length === 0 ? (
            <p className="text-sm text-attenue">{t("Données insuffisantes pour rédiger la synthèse.", "Not enough data to write the summary.")}</p>
          ) : (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[0.95rem] leading-relaxed">
              {phrases.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </Carte>

        <Carte titre={t("Banques centrales", "Central banks")}>
          <div className="flex flex-col gap-4">
            <Section titre={t(`Décisions des ${fenetreDecisions} derniers jours`, `Decisions over the last ${fenetreDecisions} days`)}>
              {recentes.length === 0 ? (
                <p className="text-sm text-attenue">{t("Aucun changement de taux directeur.", "No policy rate change.")}</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {recentes.map((l) => (
                    <li key={l.devise}>
                      <span className="font-medium">{t(BANQUES[l.devise].fr, BANQUES[l.devise].en)}</span> :{" "}
                      {l.dernierPb! > 0 ? t("hausse", "hike") : t("baisse", "cut")} {t("de", "of")} {Math.abs(l.dernierPb!)} {t("pb", "bp")}{" "}
                      {t("à", "to")} {formaterPct(l.taux, 2, false, langue)} ({formaterDateSeance(l.depuis, langue)})
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section titre={t("Taux directeurs et orientation", "Policy rates and stance")}>
              <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {monde.lignes.map((l) => {
                  const o = forces.find((f) => f.devise === l.devise)?.orientation ?? "neutre";
                  return (
                    <li key={l.devise} className="flex justify-between gap-3">
                      <span>{l.devise} · {t(BANQUES[l.devise].fr, BANQUES[l.devise].en)}</span>
                      <span className="chiffres">
                        {formaterPct(l.taux, 2, false, langue)}{" "}
                        <span className="text-xs text-attenue">
                          {o === "restrictive" ? t("restrictive", "hawkish") : o === "accommodante" ? t("accommodante", "dovish") : t("neutre", "neutral")}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          </div>
        </Carte>

        <Carte titre={hebdo ? t("À venir cette semaine (impact fort)", "Coming up this week (high impact)") : t("Agenda des prochaines 24 heures", "Next 24 hours")}>
          {agenda.length === 0 ? (
            <p className="text-sm text-attenue">{t("Aucun événement majeur.", "No major event.")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-bordure text-sm">
              {agenda.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
                  <span className="chiffres w-28 shrink-0 text-xs text-attenue">
                    {hebdo ? <DateLocale iso={e.instant} options={{ weekday: "short", hour: "2-digit", minute: "2-digit" }} /> : <HeureLocale iso={e.instant} />}
                  </span>
                  <span className="w-10 shrink-0 font-semibold">{e.devise}</span>
                  <span className={`min-w-0 flex-1 ${e.impact === "fort" ? "font-medium" : ""}`}>{e.libelle}</span>
                  <span className="chiffres text-xs text-attenue">
                    {e.prevision && `${t("prév.", "fcst")} ${e.prevision}`}
                    {e.precedent && ` · ${t("préc.", "prev.")} ${e.precedent}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Carte>

        <Carte titre={hebdo ? t("Plus forts mouvements de la semaine", "Biggest moves of the week") : t("Plus forts mouvements de la séance", "Biggest moves of the session")}>
          <div className="flex flex-col gap-4">
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {mouvements.map((l) => (
                <li key={l.symbole} className="flex justify-between gap-3">
                  <span className="truncate">
                    {nomInstrument(l, langue)}{" "}
                    <span className="text-xs text-discret">{t(CLASSES.find((c) => c.cle === l.classe)!.fr, CLASSES.find((c) => c.cle === l.classe)!.en)}</span>
                  </span>
                  <span className={`chiffres font-medium ${variation(l)! >= 0 ? "text-hausse" : "text-baisse"}`}>{pct(variation(l), 2)}</span>
                </li>
              ))}
            </ul>
            {tauxBouges.length > 0 && (
              <p className="chiffres text-sm text-attenue">
                {t("Taux :", "Rates:")}{" "}
                {tauxBouges.map((l) => `${nomInstrument(l, langue)} ${formaterNombre(l.cloture, 2, langue)}${en ? "%" : " %"} (${l.variation === "pb" ? formaterPb(variation(l), langue) : pct(variation(l))})`).join(" · ")}
              </p>
            )}
          </div>
        </Carte>

        {!hebdo && (
          <Carte titre={t("Fil instantané : l'essentiel des dernières 24 heures", "Live squawk: the essentials of the last 24 hours")}>
            {forts.length === 0 ? (
              <p className="text-sm text-attenue">{t("Rien d'important à signaler.", "Nothing important to report.")}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-bordure text-sm">
                {forts.map((s) => (
                  <li key={s.id} className="flex gap-3 py-1.5">
                    <span className="chiffres w-11 shrink-0 text-xs text-attenue"><HeureLocale iso={s.date_publication} /></span>
                    <span className="min-w-0 flex-1">
                      {s.titre}{" "}
                      {s.categorie && CATEGORIES[s.categorie] && <Pastille>{t(CATEGORIES[s.categorie].fr, CATEGORIES[s.categorie].en)}</Pastille>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        )}

        {hebdo && (
          <Carte titre={t("Statistiques américaines publiées", "US data released")}>
            <ul className="flex flex-col divide-y divide-bordure text-sm">
              {calendrier.publications.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 py-1.5">
                  <span>{p.libelle}</span>
                  <span className="chiffres">
                    {p.valeur === null ? "—" : `${formaterNombre(p.valeur, p.unite === "pct" ? 1 : 0, langue)}${p.unite === "pct" ? (en ? "%" : " %") : " k"}`}{" "}
                    <span className="text-xs text-attenue">{formaterDateSeance(p.detecteeLe, langue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Carte>
        )}

        <Avertissement />
      </main>
    </>
  );
}
