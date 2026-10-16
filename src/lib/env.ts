import "server-only";

function requise(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return valeur;
}

// Lecture à l'exécution (jamais injectée dans le bundle navigateur).
export const env = {
  get supabaseUrl() {
    return requise("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseClePubliable() {
    return requise("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  },
  get secretFonctions() {
    return requise("FUNCTIONS_SECRET");
  },
};
