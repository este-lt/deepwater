// Vérifie qu'aucun secret ne fuit : dans les fichiers suivis par git, dans les
// variables NEXT_PUBLIC_* et dans le code envoyé au navigateur (.next/static).
// Lancé automatiquement après chaque build (npm run build) : une fuite fait échouer
// le déploiement. Usage manuel : node scripts/verifier-secrets.mjs
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const racine = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const problemes = [];

// Valeurs secrètes : .env.local en local, variables d'environnement sur Railway.
const env = { ...process.env };
const fichierEnv = join(racine, ".env.local");
if (existsSync(fichierEnv)) {
  for (const ligne of readFileSync(fichierEnv, "utf8").split(/\r?\n/)) {
    const i = ligne.indexOf("=");
    if (i > 0 && !ligne.startsWith("#")) env[ligne.slice(0, i)] ??= ligne.slice(i + 1);
  }
}
const NOMS_SECRETS = [
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SIGNING_SECRET",
  "FUNCTIONS_SECRET",
  "ALPHA_VANTAGE_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const valeursSecretes = NOMS_SECRETS.map((nom) => [nom, env[nom]]).filter(([, v]) => v && v.length >= 8);

const MOTIFS = [
  [/sk_(test|live)_[A-Za-z0-9]{20,}/, "clé secrète Clerk"],
  [/whsec_[A-Za-z0-9+/=]{20,}/, "secret de webhook"],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "clé secrète Supabase"],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/, "JWT service_role Supabase"],
];

function analyser(contenu, origine) {
  for (const [motif, libelle] of MOTIFS) {
    if (motif.test(contenu)) problemes.push(`${origine} : ${libelle}`);
  }
  for (const [nom, valeur] of valeursSecretes) {
    if (contenu.includes(valeur)) problemes.push(`${origine} : valeur de ${nom}`);
  }
}

// 1. Fichiers suivis par git (ce qui part sur GitHub).
try {
  const fichiers = execSync("git ls-files", { cwd: racine, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of fichiers) {
    if (/\.(ico|png|jpg|woff2?)$/.test(f)) continue;
    const chemin = join(racine, f);
    if (existsSync(chemin)) analyser(readFileSync(chemin, "utf8"), f);
  }
} catch {
  // Pas de dépôt git (ex. image de build) : on passe aux autres contrôles.
}

// 2. Aucune variable secrète ne doit être exposée via NEXT_PUBLIC_.
const PUBLIQUES_AUTORISEES = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
  "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
]);
for (const nom of Object.keys(env)) {
  if (nom.startsWith("NEXT_PUBLIC_") && !PUBLIQUES_AUTORISEES.has(nom)) {
    problemes.push(`variable ${nom} : exposée au navigateur sans être dans la liste autorisée`);
  }
}
function parcourir(dossier, rappel) {
  if (!existsSync(dossier)) return;
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) parcourir(chemin, rappel);
    else rappel(chemin);
  }
}
parcourir(join(racine, "src"), (chemin) => {
  const contenu = readFileSync(chemin, "utf8");
  for (const m of contenu.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
    if (!PUBLIQUES_AUTORISEES.has(m[0])) problemes.push(`${chemin} : ${m[0]} non autorisée`);
  }
});

// 3. Code envoyé au navigateur après build.
parcourir(join(racine, ".next", "static"), (chemin) => {
  if (chemin.endsWith(".js") || chemin.endsWith(".css") || chemin.endsWith(".html")) {
    analyser(readFileSync(chemin, "utf8"), chemin.slice(racine.length));
  }
});

if (problemes.length) {
  console.error("Fuite de secret possible :\n - " + [...new Set(problemes)].join("\n - "));
  process.exit(1);
}
console.log(`Aucune fuite détectée (${valeursSecretes.length} secrets vérifiés, git + NEXT_PUBLIC_ + bundle navigateur).`);
