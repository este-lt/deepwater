# Deepwater

Terminal de marché gratuit : biais quotidien du **S&P 500** et du **Nasdaq-100**, moniteur
multi-actifs (indices, volatilité, taux, crédit, devises, matières premières, crypto),
banques centrales et macro des 8 grandes économies, régime risk-on/risk-off et
corrélations, force des devises et paires par confluence, calendrier mondial avec
consensus, fil instantané filtré, actualités, rapports quotidien et hebdomadaire. Aucune
action individuelle. Site bilingue (français, anglais), apparence et tableau de bord
personnalisables par chaque utilisateur. Données publiques gratuites, différées (sauf fil
instantané et crypto). Sources et limites : [docs/SOURCES.md](docs/SOURCES.md).

## Architecture

| Couche | Rôle |
|---|---|
| Next.js 16 (App Router, TypeScript strict, Tailwind) sur Railway | interface ; lit la base avec le jeton Clerk de l'utilisateur |
| Clerk | connexion ; webhook signé et fonction de secours pour créer le profil |
| Supabase Postgres + RLS | données de marché partagées en lecture, paramètres et validations par utilisateur |
| Supabase Edge Functions (`supabase/functions`) | collectes (`collecte-marches` : FRED, BCE, CoinGecko, Forex Factory, BRI, OCDE, BNS, Eurostat ; `collecte-av` : or et argent ; `collecte-rss` : articles et squawks, traduction MyMemory), calcul du biais |
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
- filtre du fil instantané : `supabase/functions/_shared/squawks.ts`
- biais quotidien : `supabase/functions/calcul-biais/regles.ts`
- régime, corrélations, force des devises, paires : `src/lib/analyse.ts`

Textes du site : écrits dans les deux langues à l'endroit où ils s'affichent,
`t("Texte", "Text")` (`src/lib/i18n.ts`, `useLangue()` côté navigateur).

## Commandes

| Commande | Effet |
|---|---|
| `npm run build` | compilation, puis recherche de fuites de secrets |
| `npm run lint` | ESLint |
| `npx deno test --allow-read supabase/functions` | tests (filtres articles et squawks, calendriers, macro mondiale, Alpha Vantage, biais, analyses du site) |
| `npm run test:comptes` | crée ou rafraîchit les deux comptes de test (Clerk) |
| `npm run test:rls -- <id d'un biais>` | isolation RLS entre les deux comptes |
| `npm run test:webhook` | signature et idempotence du webhook Clerk |
| `npm run test:secours` | création de profil de secours à la première connexion |
| `npm run test:liens` | liens de connexion des comptes de test (valables 7 jours) |

## Avertissement

Le biais quotidien est un scoring automatique basé sur des règles, pas une prédiction
garantie ni un conseil en investissement. L'exécution des ordres se fait exclusivement
chez votre broker, en dehors de Deepwater.
