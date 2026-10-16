// deno test supabase/functions/_shared/alpha-vantage.test.ts
import { aInterrogeAlphaVantage, classerMessage, extraireSerieQuotidienne } from "./alpha-vantage.ts";

function egal(reel: unknown, attendu: unknown, libelle: string) {
  if (JSON.stringify(reel) !== JSON.stringify(attendu)) {
    throw new Error(`${libelle} : obtenu ${JSON.stringify(reel)}, attendu ${JSON.stringify(attendu)}`);
  }
}

Deno.test("accès refusé à un endpoint payant (texte réel, cite « requests per minute »)", () => {
  egal(
    classerMessage(
      "You are not yet entitled to index data access. Please subscribe to any of our 150, 300, 600, or 1200 requests per minute premium plans at https://www.alphavantage.co/premium/ for your personal non-professional use.",
    ),
    "premium",
    "INDEX_DATA",
  );
  egal(
    classerMessage("Thank you for using Alpha Vantage! This is a premium endpoint. You may subscribe to any of the premium plans."),
    "premium",
    "endpoint premium",
  );
});

Deno.test("limite quotidienne ou de fréquence atteinte", () => {
  egal(
    classerMessage(
      "We have detected your API key as XXXX and our standard API rate limit is 25 requests per day. Please subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to instantly remove all daily rate limits.",
    ),
    "limite_av",
    "25 par jour",
  );
  egal(
    classerMessage(
      "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute and 500 calls per day.",
    ),
    "limite_av",
    "fréquence",
  );
});

Deno.test("rafale (texte réel, cite « premium features » et « 25 requests per day »)", () => {
  egal(
    classerMessage(
      "Thank you for using Alpha Vantage! Please consider spreading out your free API requests more sparingly (1 request per second). You may subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to lift the free key rate limit (25 requests per day), raise the per-second burst limit, and unlock all premium features.",
    ),
    "rafale",
    "rafale",
  );
});

Deno.test("pause obligatoire après toute réponse venue d'Alpha Vantage", () => {
  egal(aInterrogeAlphaVantage({ statut: "premium", message: "" }), true, "premium");
  egal(aInterrogeAlphaVantage({ statut: "rafale", message: "" }), true, "rafale");
  egal(aInterrogeAlphaVantage({ statut: "ok", donnees: {}, depuisCache: false }), true, "ok réseau");
  egal(aInterrogeAlphaVantage({ statut: "ok", donnees: {}, depuisCache: true }), false, "ok cache");
  egal(aInterrogeAlphaVantage({ statut: "quota_local", message: "" }), false, "quota local");
});

Deno.test("série quotidienne FX : tri chronologique et conversion numérique", () => {
  const barres = extraireSerieQuotidienne({
    "Meta Data": {},
    "Time Series FX (Daily)": {
      "2026-10-15": { "1. open": "1.1600", "2. high": "1.1650", "3. low": "1.1580", "4. close": "1.1620" },
      "2026-10-14": { "1. open": "1.1550", "2. high": "1.1610", "3. low": "1.1540", "4. close": "1.1600" },
    },
  });
  egal(barres.map((b) => b.date), ["2026-10-14", "2026-10-15"], "ordre");
  egal(barres[1], { date: "2026-10-15", ouverture: 1.16, plus_haut: 1.165, plus_bas: 1.158, cloture: 1.162, volume: null }, "barre");
});
