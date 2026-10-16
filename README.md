# Deepwater

Terminal de suivi de marché gratuit, centré sur le **S&P 500** et le **Nasdaq-100** :
cours de clôture et moyennes mobiles, biais quotidien par règles, taux du Trésor,
macroéconomie américaine, flux d'initiés et d'institutions (SEC), veille d'actualités
filtrée et calendrier économique. Données publiques gratuites, différées, jamais en temps
réel. Les sources et leurs limites sont détaillées dans [docs/SOURCES.md](docs/SOURCES.md).

## Architecture

| Couche | Rôle |
|---|---|
| Next.js 16 (App Router, TypeScript strict, Tailwind) sur Railway | interface ; lit la base avec le jeton Clerk de l'utilisateur |
| Clerk | connexion ; webhook signé et fonction de secours pour créer le profil |
| Supabase Postgres + RLS | données de marché partagées en lecture, paramètres et validations par utilisateur |
| Supabase Edge Functions (`supabase/functions`) | collectes (FRED, Alpha Vantage, SEC, RSS), calcul du biais |
| pg_cron + pg_net | planification ; chaque tâche écrit dans `logs_taches` (page Admin) |
| Supabase Vault | secrets lus côté serveur uniquement |

Les utilisateurs ne déclenchent jamais d'appel à une API externe : l'interface lit la
base, et le seul calcul à la demande (biais) n'utilise que les données déjà collectées.

## Installation locale

1. `npm install`
2. Copier `.env.example` en `.env.local` et renseigner les valeurs (jamais commité).
3. `npm run dev`, puis ouvrir http://localhost:3000.

Les migrations sont dans `supabase/migrations`, les fonctions dans `supabase/functions`
(code partagé dans `_shared`). Les règles modifiables :

- filtre des actualités : `supabase/functions/_shared/filtre-actualites.ts`
- biais quotidien : `supabase/functions/calcul-biais/regles.ts`

## Commandes

| Commande | Effet |
|---|---|
| `npm run build` | compilation, puis recherche de fuites de secrets |
| `npm run lint` | ESLint |
| `npx deno test --allow-read supabase/functions` | tests des Edge Functions (filtre, SEC, Alpha Vantage, biais) |
| `npm run test:comptes` | crée ou rafraîchit les deux comptes de test (Clerk) |
| `npm run test:rls -- <id d'un biais>` | isolation RLS entre les deux comptes |
| `npm run test:webhook` | signature et idempotence du webhook Clerk |
| `npm run test:secours` | création de profil de secours à la première connexion |
| `npm run test:liens` | liens de connexion des comptes de test (valables 7 jours) |

## Avertissement

Le biais quotidien est un scoring automatique basé sur des règles, pas une prédiction
garantie ni un conseil en investissement. L'exécution des ordres se fait exclusivement
chez votre broker, en dehors de Deepwater.
