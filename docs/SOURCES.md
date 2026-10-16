# Sources de données et limites réelles

Deepwater n'affiche que des données collectées auprès des sources ci-dessous, toutes
gratuites et officielles (sauf mention). Une donnée absente est marquée « indisponible ».
Rien n'est en temps réel : clôtures quotidiennes officielles, sauf la crypto (cours du
moment). Chaque ligne affiche sa date ; elle passe en orange quand elle est en retard.

Heures : stockées en UTC, affichées dans le fuseau du navigateur. Les heures officielles
(Fed 14 h 00 à New York, BCE 14 h 15 à Francfort, statistiques américaines 8 h 30 à New
York, séance de Wall Street 9 h 30-16 h) sont converties avec le changement d'heure de la
ville concernée.

Aucune action individuelle n'est suivie : seulement les marchés dans leur ensemble.

## Univers suivi

Chaque utilisateur choisit les classes affichées (aucun réglage administrateur).

| Classe | Instruments | Source | Fréquence |
|---|---|---|---|
| Indices actions | S&P 500, Nasdaq-100 (prioritaires), Dow Jones, Nikkei 225 | FRED (`SP500`, `NASDAQ100`, `DJIA`, `NIKKEI225`) | clôture quotidienne, publiée le lendemain matin |
| Volatilité | VIX, VXN | FRED (`VIXCLS`, `VXNCLS`) | quotidienne |
| Taux | 2, 10 et 30 ans, taux réel 10 ans, inflation anticipée 10 ans, taux Fed effectif ; courbe 3 mois-30 ans | FRED (`DGS*`, `DFII10`, `T10YIE`, `DFF`) | quotidienne |
| Crédit | spreads haut rendement et catégorie investissement, conditions financières | FRED (`BAMLH0A0HYM2`, `BAMLC0A0CM`, `NFCI`) | quotidienne ; NFCI hebdomadaire. Spreads ICE BofA limités à 3 ans d'historique sur FRED |
| Devises | EUR/USD, USD/JPY, GBP/USD, USD/CHF, USD/CAD, AUD/USD, USD/CNY | BCE, cours de référence (`data-api.ecb.europa.eu`) | jours ouvrés, vers 16 h à Francfort ; paires contre le dollar déduites des cours en euros |
| Devises | dollar, indice large de la Fed | FRED (`DTWEXBGS`) | publié chaque semaine, environ une semaine de décalage |
| Matières premières | pétrole WTI et Brent, gaz naturel Henry Hub | FRED (`DCOILWTICO`, `DCOILBRENTEU`, `DHHNGSP`, données EIA) | quotidienne, 1 à 2 jours de décalage |
| Matières premières | or, argent | Alpha Vantage `GOLD_SILVER_HISTORY` | quotidienne |
| Crypto | bitcoin, ether | clôtures Coinbase sur FRED (`CBBTCUSD`, `CBETHUSD`) + cours du moment CoinGecko | quotidienne + toutes les 15 min |

Historique : 10 ans au premier chargement, puis rechargement des 30 derniers jours à
chaque passage (les révisions officielles sont reprises). Moyennes mobiles 20 et 50
jours calculées en base.

FRED exige un en-tête `User-Agent` identifiant (les navigateurs génériques sont bloqués).
Une série en panne est journalisée et ignorée sans bloquer les autres.

## Alpha Vantage (offre gratuite)

Utilisé seulement pour l'or et l'argent (2 appels par jour), et pour les indices si un
abonnement payant est activé dans la page Admin (`INDEX_DATA` : ouverture, plus haut,
plus bas). Quota gratuit : 25 requêtes par jour, une par seconde, compteur en base, cache,
réponses « Note » ou « Information » jamais mises en cache. Endpoints payants constatés :
`INDEX_DATA`, `OVERVIEW`.

## Sources écartées

| Source | Raison |
|---|---|
| Cours en séance (indices, devises, matières premières) | aucune source officielle gratuite ; l'API non officielle de Yahoo Finance fonctionne mais contrevient à ses conditions d'utilisation (écartée) |
| Stooq | protégé par une vérification anti-robot |
| Reuters, Bloomberg | plus de flux RSS public gratuit |
| SEC EDGAR (initiés, 13F), fondamentales, actions | retirés : concernent des entreprises individuelles |
| Indices européens (DAX, CAC, Stoxx) | non disponibles gratuitement sur FRED ; l'actualité européenne reste suivie |
| Cuivre | uniquement mensuel en source gratuite : sans intérêt au quotidien |

## Macroéconomie américaine

Séries FRED, mêmes chiffres que les communiqués officiels :

| Indicateur | Série | Affiché |
|---|---|---|
| Inflation CPI | `CPIAUCNS` | sur 1 an |
| CPI sous-jacent | `CPILFENS` | sur 1 an |
| PCE sous-jacent (cible de la Fed) | `PCEPILFE` | sur 1 an |
| Prix à la production | `PPIFID` | sur 1 an |
| Taux de chômage | `UNRATE` | niveau |
| Emplois créés | `PAYEMS` | variation mensuelle |
| Inscriptions au chômage | `ICSA` | hebdomadaire |
| Ventes au détail | `RSAFS` | sur 1 mois |
| PIB réel | `GDPC1` | trimestre annualisé |

Les comparaisons se font par date : un mois jamais publié (octobre 2025, shutdown
fédéral) rend la valeur « indisponible » au lieu d'un calcul faux sur 13 mois.
Contrôle : PPI de septembre 2026 à +6,34 % sur 1 an (FRED), +6,3 % annoncé par le BLS.

## Calendrier économique

- **Réunions Fed et BCE** : dates officielles relevées le 16/10/2026 sur
  federalreserve.gov et ecb.europa.eu. Dates FOMC 2027 provisoires, signalées comme telles.
- **Prochaines statistiques** (CPI, emploi, PCE, PIB, PPI, ventes au détail,
  inscriptions au chômage) : API FRED (`release/dates`), **clé API gratuite requise**,
  stockée dans le coffre Supabase (`fred_api_key`). Sans clé : « indisponible ».
- **Dernières publications** : détectées quand une nouvelle période apparaît dans la
  série FRED ; valeur, précédente et écart.
- **Consensus des économistes : indisponible** (payant partout). L'écart affiché compare
  chaque publication à la précédente ; c'est cette « surprise » que le biais utilise.

## Actualités

Flux RSS relus toutes les 30 minutes : WSJ Marchés (`feeds.content.dowjones.io`), FT
Marchés et FT Europe (`User-Agent` honnête requis), CNBC Marchés et Économie, Fed
(communiqués de politique monétaire), BCE (décisions). Stockage : titre, lien, date,
source, extrait de 280 caractères au plus ; le texte complet n'est jamais récupéré.

Filtre (`supabase/functions/_shared/filtre-actualites.ts`, règles modifiables) :

- **Gardé** : décisions et messages des banques centrales ; statistiques macro publiées ;
  mouvements du marché dans son ensemble (indices, taux, devises, matières premières,
  crypto ; mouvements forts seulement hors actions ; rien sous 2 %) ; politique
  économique qui touche les marchés (droits de douane impliquant les États-Unis,
  shutdown, plafond de la dette, déficit fédéral, OPEP, sanctions).
- **Rejeté** : tout ce qui concerne une entreprise (résultats, fusions, introductions en
  Bourse, listes de valeurs, amendes, procès) ; politique locale (gouverneurs, États,
  villes) ; statistiques de pays secondaires (hors États-Unis, Europe, Chine, Japon) ;
  articles de fond et analyses ; conditionnel et rumeurs ; conseils personnels ; faits
  divers.
- **Validation** : une cinquantaine de cas en tests automatiques, titres réels des 14-16/10/2026 pour la plupart ; relecture à la
  main des articles retenus le 16/10/2026 (15 gardés, tous des faits de marché). Après
  toute modification des règles, le mode `reclasser` de `collecte-rss` repasse les
  articles stockés au filtre.

## Biais quotidien (S&P 500, Nasdaq-100)

Scoring automatique basé sur des règles, pas une prédiction garantie ni un conseil en
investissement. Règles : `supabase/functions/calcul-biais/regles.ts`.

| Facteur | Donnée | Poids S&P 500 / Nasdaq-100 |
|---|---|---|
| Tendance | clôture face aux moyennes mobiles 20 et 50 jours | 35 % / 35 % |
| Taux longs | 10 ans : variation sur 5 séances, écart à sa moyenne d'un an | 20 % / 25 % |
| Surprise macro | publications des 45 derniers jours comparées aux précédentes | 15 % / 10 % |
| Appétit pour le risque | VIX (ou VXN) face à sa médiane d'un an et sur 5 séances ; spread haut rendement sur 5 séances | 30 % / 30 % |

Note de −1 à +1 par facteur, moyenne pondérée, haussier ≥ +0,2, baissier ≤ −0,2.
Facteur sans donnée récente : « indisponible », poids retiré ; pas de biais sans le cours
de l'indice ou avec moins de la moitié du poids. Calcul unique pour tous, depuis la base
seulement ; automatique à 8 h 30 (New York) si un utilisateur l'active, sinon manuel
(un calcul toutes les 5 minutes par compte). Jours fériés boursiers non gérés.

## Hébergement et exploitation

### Supabase (plan gratuit)

- Pause des projets gratuits après 7 jours de faible activité : e-mail d'avertissement
  environ une semaine avant, relance possible pendant 90 jours depuis le tableau de bord
  (*Resume project*). Source : supabase.com/docs/guides/platform/free-project-pausing
  (16/10/2026). Ici, les collectes écrivent en base toutes les 15 à 30 minutes. Seul le
  plan Pro supprime la pause. Pas de sauvegarde téléchargeable sur le plan gratuit.
- Fonction `collecte-sec` : n'est plus appelée (code supprimé, tâches planifiées
  retirées) ; elle peut être supprimée dans le tableau de bord Supabase (*Edge Functions*).

### Railway

- Un service `web` (Next.js). Consommation mesurée le 16/10/2026 : environ 0,12 Go de
  mémoire, processeur quasi nul. Essai : crédit unique de 5 $ ; plan Hobby : abonnement
  incluant 5 $ d'usage (docs.railway.com/pricing). Crédit restant : Railway, *Usage*.
- **Déploiement automatique non branché** : un `git push` ne redéploie pas. Pour
  l'activer : Railway, service `web`, *Settings*, *Source*, reconnecter `este-lt/deepwater`
  et accepter l'application Railway sur GitHub.
- Point de santé public : `/api/health` (base, dernière tâche réussie, version déployée).

### Alertes du conseiller de sécurité Supabase (volontaires)

| Alerte | Raison |
|---|---|
| RLS sans politique sur `cache_api` et `appels_fonctions` | tables internes, accès service role uniquement |
| `sante()` exécutable sans connexion | alimente `/api/health`, aucune donnée sensible |
| `est_admin()`, `admin_etat_cron()`, `reserver_calcul_manuel()`, `derniere_reussite()` exécutables par un utilisateur connecté | nécessaires à l'interface ; `admin_etat_cron()` refuse tout non-admin, `reserver_calcul_manuel()` applique la limite |

### Contrôles

- Isolation RLS : `npm run test:comptes` puis `npm run test:rls -- <id d'un biais>`
  (43 contrôles avec deux comptes de test).
- Webhook Clerk signé et idempotent : `npm run test:webhook`.
- Fuites de secrets : `npm run build` lance `scripts/verifier-secrets.mjs`.
- Edge Functions : `npx deno test --allow-read supabase/functions` (filtre, calendrier,
  biais, Alpha Vantage).
