import { supabaseAnonyme } from "@/lib/supabase";

// Health check public (Railway, supervision) : aucune donnée sensible.
export async function GET() {
  const entetes = { "Cache-Control": "no-store" };
  try {
    const { data, error } = await supabaseAnonyme().rpc("sante");
    if (error) throw new Error(error.message);
    const sante = (data ?? {}) as { derniere_tache_reussie?: string | null };
    return Response.json(
      {
        statut: "ok",
        service: "deepwater",
        base: "ok",
        heure: new Date().toISOString(),
        derniere_tache_reussie: sante.derniere_tache_reussie ?? null,
      },
      { headers: entetes },
    );
  } catch {
    return Response.json(
      { statut: "degrade", service: "deepwater", base: "injoignable", heure: new Date().toISOString() },
      { status: 503, headers: entetes },
    );
  }
}
