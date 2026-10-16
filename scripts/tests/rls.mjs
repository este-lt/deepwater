import { readFileSync } from "node:fs";
import { rest } from "./lib.mjs";

const { a, b } = JSON.parse(readFileSync(new URL("./comptes.json", import.meta.url)));
const BIAIS = process.argv[2];
let ok = 0;
let ko = 0;
function verifier(libelle, condition, detail) {
  if (condition) {
    ok++;
    console.log("  OK    " + libelle);
  } else {
    ko++;
    console.log("  ECHEC " + libelle + " -> " + JSON.stringify(detail).slice(0, 200));
  }
}
const R = "return=representation";

console.log("Profils");
let r = await rest("/profils?select=clerk_user_id,role", { jwt: a.jwt });
verifier("A ne voit que son profil", r.statut === 200 && r.donnees.length === 1 && r.donnees[0].clerk_user_id === a.id, r);
r = await rest(`/profils?clerk_user_id=eq.${b.id}`, { jwt: a.jwt });
verifier("A ne lit pas le profil de B (filtre explicite)", r.statut === 200 && r.donnees.length === 0, r);
r = await rest(`/profils?clerk_user_id=eq.${a.id}`, { jwt: a.jwt, methode: "PATCH", corps: { role: "admin" }, prefer: R });
verifier("A ne peut pas se promouvoir admin", r.statut >= 400, r);
r = await rest("/profils", { jwt: a.jwt, methode: "POST", corps: { clerk_user_id: "user_faux", role: "admin" } });
verifier("A ne peut pas creer de profil", r.statut >= 400, r);

console.log("Parametres");
r = await rest("/parametres_utilisateur?select=clerk_user_id,biais_auto_actif", { jwt: a.jwt });
verifier("A ne voit que ses parametres", r.statut === 200 && r.donnees.length === 1 && r.donnees[0].clerk_user_id === a.id, r);
r = await rest(`/parametres_utilisateur?clerk_user_id=eq.${b.id}`, { jwt: a.jwt, methode: "PATCH", corps: { biais_auto_actif: true }, prefer: R });
verifier("A ne modifie pas les parametres de B (0 ligne)", r.statut === 200 && r.donnees.length === 0, r);
r = await rest("/parametres_utilisateur?select=biais_auto_actif", { jwt: b.jwt });
verifier("... et ceux de B sont intacts", r.statut === 200 && r.donnees[0]?.biais_auto_actif === false, r);
r = await rest(`/parametres_utilisateur?clerk_user_id=eq.${a.id}`, { jwt: a.jwt, methode: "PATCH", corps: { biais_auto_actif: true }, prefer: R });
verifier("A modifie ses propres parametres", r.statut === 200 && r.donnees.length === 1 && r.donnees[0].biais_auto_actif === true, r);
await rest(`/parametres_utilisateur?clerk_user_id=eq.${a.id}`, { jwt: a.jwt, methode: "PATCH", corps: { biais_auto_actif: false } });
r = await rest(`/parametres_utilisateur?clerk_user_id=eq.${a.id}`, { jwt: a.jwt, methode: "PATCH", corps: { clerk_user_id: b.id }, prefer: R });
verifier("A ne peut pas reattribuer ses parametres a B", r.statut >= 400, r);
r = await rest("/parametres_utilisateur", { jwt: a.jwt, methode: "POST", corps: { clerk_user_id: b.id } });
verifier("A ne peut pas creer de parametres pour B", r.statut >= 400, r);
r = await rest(`/parametres_utilisateur?clerk_user_id=eq.${a.id}`, { jwt: a.jwt, methode: "DELETE" });
verifier("A ne peut pas supprimer ses parametres", r.statut >= 400, r);

console.log("Validations de biais");
r = await rest("/validations_biais", { jwt: a.jwt, methode: "POST", corps: { biais_id: BIAIS, decision: "valide", commentaire: "test A" }, prefer: R });
verifier("A valide le biais de test", r.statut === 201 && r.donnees[0]?.clerk_user_id === a.id, r);
const validationA = r.donnees?.[0]?.id;
// Les comptes de test peuvent garder des validations d'anciens passages : on cible le biais testé.
r = await rest(`/validations_biais?select=id,clerk_user_id&biais_id=eq.${BIAIS}`, { jwt: b.jwt });
verifier("B ne voit pas la validation de A", r.statut === 200 && r.donnees.every((v) => v.clerk_user_id === b.id), r);
r = await rest(`/validations_biais?id=eq.${validationA}`, { jwt: b.jwt, methode: "PATCH", corps: { decision: "rejete" }, prefer: R });
verifier("B ne modifie pas la validation de A (0 ligne)", r.statut === 200 && r.donnees.length === 0, r);
r = await rest(`/validations_biais?id=eq.${validationA}`, { jwt: b.jwt, methode: "DELETE", prefer: R });
verifier("B ne supprime pas la validation de A (0 ligne)", r.statut === 200 && r.donnees.length === 0, r);
r = await rest("/validations_biais", { jwt: b.jwt, methode: "POST", corps: { biais_id: BIAIS, decision: "rejete", clerk_user_id: a.id } });
verifier("B ne peut pas ecrire au nom de A", r.statut >= 400, r);
r = await rest("/validations_biais", { jwt: b.jwt, methode: "POST", corps: { biais_id: BIAIS, decision: "rejete" }, prefer: R });
verifier("B rejette le biais pour lui-meme", r.statut === 201, r);
r = await rest(`/validations_biais?select=decision,clerk_user_id&biais_id=eq.${BIAIS}`, { jwt: a.jwt });
verifier("A voit 1 seule validation, la sienne, intacte", r.statut === 200 && r.donnees.length === 1 && r.donnees[0].clerk_user_id === a.id && r.donnees[0].decision === "valide", r);
r = await rest("/validations_biais?select=clerk_user_id", { jwt: a.jwt });
verifier("A ne voit aucune validation d'un autre compte", r.statut === 200 && r.donnees.every((v) => v.clerk_user_id === a.id), r);

console.log("Donnees de marche partagees (lecture seule)");
r = await rest("/tickers_suivis?select=symbole", { jwt: a.jwt });
verifier("A lit les tickers", r.statut === 200 && r.donnees.length >= 1, r);
r = await rest("/biais_quotidien?select=id", { jwt: b.jwt });
verifier("B lit le biais global", r.statut === 200 && r.donnees.length >= 1, r);
r = await rest("/tickers_suivis?symbole=eq.TEST_RLS", { jwt: a.jwt, methode: "PATCH", corps: { actif_bool: true }, prefer: R });
verifier("Non-admin ne peut pas activer un marche (0 ligne)", r.statut === 200 && r.donnees.length === 0, r);
r = await rest("/tickers_suivis", { jwt: a.jwt, methode: "POST", corps: { symbole: "X", nom: "X", classe_actif: "action", source_principale: "x" } });
verifier("A ne peut pas creer de ticker", r.statut >= 400, r);
r = await rest("/prix_historique", { jwt: a.jwt, methode: "POST", corps: { ticker_id: "00000000-0000-0000-0000-000000000000", date: "2026-01-01", cloture: 1, source_donnee: "x" } });
verifier("A ne peut pas ecrire de prix", r.statut >= 400, r);
r = await rest(`/biais_quotidien?id=eq.${BIAIS}`, { jwt: a.jwt, methode: "DELETE" });
verifier("A ne peut pas supprimer un biais", r.statut >= 400, r);

console.log("Zones internes");
r = await rest("/logs_taches?select=id", { jwt: a.jwt });
verifier("Non-admin : journal vide", r.statut === 200 && r.donnees.length === 0, r);
r = await rest("/cache_api?select=id", { jwt: a.jwt });
verifier("cache_api inaccessible", r.statut >= 400, r);
r = await rest("/rpc/lire_secret", { jwt: a.jwt, methode: "POST", corps: { p_nom: "secret_fonctions" } });
verifier("Lecture d'un secret Vault refusee", r.statut >= 400, r);
r = await rest("/rpc/est_admin", { jwt: a.jwt, methode: "POST", corps: {} });
verifier("est_admin = false pour A", r.statut === 200 && r.donnees === false, r);
r = await rest("/rpc/remplacer_biais", { jwt: a.jwt, methode: "POST", corps: { p_biais: { biais: "haussier" } } });
verifier("A ne peut pas publier un biais (remplacer_biais)", r.statut >= 400, r);
r = await rest("/rpc/declencher_biais_auto", { jwt: a.jwt, methode: "POST", corps: {} });
verifier("A ne peut pas declencher le calcul automatique", r.statut >= 400, r);
r = await rest("/rpc/derniere_reussite", { jwt: a.jwt, methode: "POST", corps: { p_tache: "collecte-rss" } });
verifier("A lit la fraicheur d'une tache (heure seule)", r.statut === 200, r);
r = await rest("/rpc/derniere_reussite", { methode: "POST", corps: { p_tache: "collecte-rss" } });
verifier("Anonyme : fraicheur des taches refusee", r.statut >= 400, r);
r = await rest(`/parametres_utilisateur?clerk_user_id=eq.${b.id}`, { jwt: a.jwt, methode: "PATCH", corps: { classes_affichees: ["crypto"] }, prefer: R });
verifier("A ne change pas les classes affichees de B (0 ligne)", r.statut === 200 && r.donnees.length === 0, r);
r = await rest("/rpc/resume_marches", { jwt: a.jwt, methode: "POST", corps: {} });
verifier("A lit le moniteur multi-actifs", r.statut === 200 && r.donnees.length >= 20, r);
r = await rest("/rpc/resume_marches", { methode: "POST", corps: {} });
verifier("Anonyme : moniteur refuse", r.statut >= 400, r);

console.log("Limitation du calcul manuel");
r = await rest("/rpc/reserver_calcul_manuel", { jwt: a.jwt, methode: "POST", corps: {} });
verifier("1re demande autorisee", r.donnees?.autorise === true, r);
r = await rest("/rpc/reserver_calcul_manuel", { jwt: a.jwt, methode: "POST", corps: {} });
verifier("2e demande immediate refusee", r.donnees?.autorise === false, r);
r = await rest("/rpc/reserver_calcul_manuel", { jwt: b.jwt, methode: "POST", corps: {} });
verifier("B n'est pas bloque par la limite de A", r.donnees?.autorise === true, r);

console.log("Anonyme et jeton falsifie");
r = await rest("/profils?select=id");
verifier("Anonyme : profils refuses", r.statut >= 400, r);
r = await rest("/tickers_suivis?select=id");
verifier("Anonyme : donnees de marche refusees", r.statut >= 400, r);
r = await rest("/rpc/sante", { methode: "POST", corps: {} });
verifier("Anonyme : sante accessible", r.statut === 200, r);
const [h, p, s] = a.jwt.split(".");
const payload = JSON.parse(Buffer.from(p, "base64url").toString());
payload.sub = b.id;
const falsifie = [h, Buffer.from(JSON.stringify(payload)).toString("base64url"), s].join(".");
r = await rest("/parametres_utilisateur?select=clerk_user_id", { jwt: falsifie });
verifier("Jeton de A modifie pour usurper B : refuse", r.statut === 401, r);

// Nettoyage : chaque compte supprime ses validations de test (droit accordé par la RLS).
await rest(`/validations_biais?biais_id=eq.${BIAIS}`, { jwt: a.jwt, methode: "DELETE" });
await rest(`/validations_biais?biais_id=eq.${BIAIS}`, { jwt: b.jwt, methode: "DELETE" });

console.log(`\nResultat : ${ok} OK, ${ko} echec(s)`);
process.exit(ko ? 1 : 0);
