import { auth } from "@clerk/nextjs/server";
import { lireSerie } from "@/lib/marches";
import { supabaseUtilisateur } from "@/lib/supabase";

const PERIODES: Record<string, number> = { "3m": 92, "6m": 183, "1a": 366, "3a": 1096, "10a": 3660 };

// Série de prix lue en base (jamais d'appel à une API externe depuis le navigateur).
export async function GET(requete: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ erreur: "Non connecté." }, { status: 401 });

  const params = new URL(requete.url).searchParams;
  const symbole = (params.get("symbole") ?? "").toUpperCase();
  const jours = PERIODES[params.get("periode") ?? "1a"] ?? PERIODES["1a"];
  if (!/^[A-Z0-9]{2,10}$/.test(symbole)) return Response.json({ erreur: "Symbole invalide." }, { status: 400 });

  const depuis = new Date(Date.now() - jours * 86_400_000).toISOString().slice(0, 10);
  const serie = await lireSerie(await supabaseUtilisateur(), symbole, depuis);
  if (!serie) return Response.json({ erreur: "Instrument inconnu ou inactif." }, { status: 404 });
  return Response.json(serie, { headers: { "Cache-Control": "private, max-age=300" } });
}
