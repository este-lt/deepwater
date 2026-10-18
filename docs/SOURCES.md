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
| Devises | EUR/USD, USD/JPY, GBP/USD, USD/CHF, USD/CAD, AUD/USD, NZD/USD, USD/CNY | BCE, cours de référence (`data-api.ecb.europa.eu`) | jours ouvrés, vers 16 h à Francfort ; paires contre le dollar déduites des cours en euros |
| Devises | dollar, indice large de la Fed | FRED (`DTWEXBGS`) | publié chaque semaine, environ une semaine de décalage |
| Matières premières | pétrole WTI et Brent, gaz naturel Henry Hub | FRED (`DCOILWTICO`, `DCOILBRENTEU`, `DHHNGSP`, données EIA) | quotidienne, 1 à 2 jours de décalage |
| Matières premières | or, argent | Alpha Vantage `GOLD_SILVER_HISTORY` | quotidienne |
| Crypto | bitcoin, ether | clôtures Coinbase sur FRED (`CBBTCUSD`, `CBETHUSD`) + cours du moment CoinGecko | quotidienne + toutes les 15 min |

Historique : 10 ans au premier chargement, puis rechargement des 30 derniers jours à
chaque passage (les révisions officielles sont reprises). Aucun indicateur technique
n'est calculé ni stocké (pas de moyenne mobile en base) ni affiché sur le site.

FRED exige un en-tête `User-Agent` identifiant (les navigateurs génériques sont bloqués).
Une série en panne est journalisée et ignorée sans bloquer les autres.

## Macro des 8 grandes économies (USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD)

Collecte quotidienne (`collecte-marches`, source `monde`, 6 h 15 UTC) :

| Donnée | Source | Remarque |
|---|---|---|
| Taux directeurs | BRI, `WS_CBPOL` (`detail=dataonly`, sinon 15 Mo de notes répétées) | seules les décisions (changements de taux) sont stockées, depuis 2015 |
| Inflation sur 1 an | FRED (`CPIAUCNS` États-Unis, `CP0000EZCCM086NEST` zone euro, calcul par date), OCDE `DF_PRICES_ALL` (Royaume-Uni, Canada, Australie mensuels ; Nouvelle-Zélande trimestriel), BNS cube `plkopr` (Suisse) | **Japon indisponible** : aucune source gratuite à jour (séries OCDE de FRED arrêtées en 2021) |
| Chômage | FRED, séries OCDE harmonisées (`LRHUTTTTGBM156S`, `LRUN64TTJPM156S`, `LRUNTTTTCAM156S`, `LRUNTTTTAUM156S`, `LRUNTTTTNZQ156S`, `LRUNTTTTCHQ156S`), `UNRATE`, Eurostat `une_rt_m` (EA21) | Nouvelle-Zélande et Suisse trimestriels |
| PIB | OCDE `DF_QNA_EXPENDITURE_GROWTH_OECD`, variation sur 1 trimestre en volume | |

L'API de l'OCDE renvoie parfois une erreur 500 passagère : une seconde tentative est faite.
Contrôles du 17/10/2026 : inflation américaine de septembre 3,74 % (FRED), BCE 2,50 %,
BoJ 1,25 %, Fed 3,875 % (milieu de la fourchette, convention BRI).

**Orientation des banques centrales (hawkish/dovish)** : aucune source gratuite fiable
d'anticipations de taux (futures). L'orientation est une règle : sens de la dernière
décision (moins de 200 jours), renforcée si la précédente allait dans le même sens,
corrigée par la tendance de l'inflation sur 3 périodes.

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
| Anticipations de taux (futures, FedWatch), Polymarket, Kalshi | payant, injoignable depuis la France ou non retenu |
| PMI (S&P Global) | propriétaire : seuls le consensus et l'horaire figurent au calendrier mondial |
| Inflation japonaise | pas de source gratuite à jour |

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
- **Consensus des économistes** : seulement pour le calendrier mondial (ci-dessous). Pour les
  publications américaines, l'écart affiché compare chaque publication à la précédente ;
  c'est cette « surprise » que le biais utilise.
- **Calendrier mondial** : flux public de Forex Factory (`nfs.faireconomy.media/ff_calendar_thisweek.json`),
  relu toutes les heures : heure exacte, devise, impact, **prévision (consensus)** et chiffre
  précédent, pour les 8 devises (Chine : impact fort seulement). Impact faible écarté, jours
  fériés gardés (liquidité). Pas de chiffre publié (« actual ») dans ce flux : il arrive par le
  fil instantané. Semaine en cours seulement ; la suivante est publiée le week-end. Titres
  traduits par glossaire (statistiques, intervenants des banques centrales), sinon par MyMemory.

## Fil instantané (squawks)

FinancialJuice (`financialjuice.com/feed.ashx?xy=rss`) et InvestingLive (`investinglive.com/feed/news`),
relus toutes les 5 minutes, titres seuls, conservés 7 jours. Filtre dédié
(`supabase/functions/_shared/squawks.ts`, testé sur des titres réels) :

- **Gardé** : propos de politique monétaire des 8 banques centrales (+ BPC) ; chiffres publiés
  des grandes économies (« Actual … Forecast … », « +0,7 % vs +0,4 % attendu ») ; mouvements
  forts (2 % et plus, records) ; politique économique (droits de douane, sanctions, OPEP,
  budget) ; géopolitique qui touche l'énergie ou le risque global (Ormuz, mer Rouge,
  pétroliers, cessez-le-feu, nucléaire).
- **Écarté** : faits divers et bilans locaux même en zone de conflit, entreprises, liens
  promotionnels (FJElite, options, CFTC), analyses techniques et résumés de séance.
- Contrôle du 17/10/2026 : 21 retenus sur 125 lus.

## Traduction automatique

Les sources sont en anglais. En français, titres et extraits sont traduits par l'API
publique MyMemory (gratuite, sans clé ; 50 000 caractères par jour avec une adresse de
contact, celle du User-Agent). Chaque texte n'est traduit qu'une fois (table `traductions`,
inaccessible aux comptes). Quota atteint ou panne : le texte anglais reste affiché, la
traduction est retentée au passage suivant. Le titre d'origine reste visible au survol.

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

## Analyses par règles (aucun appel externe, données en base)

Scorings automatiques, ni prédictions ni conseils (`src/lib/analyse.ts`, testé).

**Aucun biais ne repose sur l'analyse technique** (ni moyenne mobile, ni momentum, ni
variation de cours, ni niveau graphique) : uniquement des données concrètes.

- **Régime risk-on / risk-off** : peur mesurée par les options (VIX face à sa médiane sur
  4 mois et variation sur 5 séances, 40 %), prime de risque de crédit (spread haut
  rendement sur 5 séances, 35 %), conditions financières (NFCI de la Fed de Chicago, niveau
  et variation sur 4 semaines, 25 %). Risk-on au-dessus de +25, risk-off sous −25.
- **Corrélations** (information, pas un biais) : variations quotidiennes sur 20 et 60 séances communes (S&P 500,
  Nasdaq-100, 10 ans, VIX, EUR, JPY, AUD, or, WTI, bitcoin). **Couverture** : actif détenable
  le plus négativement corrélé au S&P 500 sur 60 séances (or, yen, franc suisse, obligations),
  proposé seulement sous −0,2.
- **Force des 8 devises** (cinq facteurs fondamentaux) : portage, taux directeur face à la
  moyenne des 8 (20 %) ; taux réel, taux directeur moins inflation (20 %) ; orientation de la
  banque centrale (25 %) ; croissance et emploi, PIB et évolution du chômage (15 %) ;
  sentiment risk-on/risk-off (20 %, devises de risque AUD, NZD, CAD contre refuges JPY,
  CHF, USD).
- **Paires** : devise forte contre devise faible ; étoiles = nombre des cinq facteurs qui
  vont dans le même sens (5 étoiles : tous).
- **Rapports** quotidien et hebdomadaire (`/rapport`) : synthèse rédigée par règles, banques
  centrales, agenda, plus forts mouvements, fil instantané ; dans la langue de l'utilisateur.

## Personnalisation (par utilisateur, aucun réglage administrateur)

Langue du site (français, anglais : interface, nombres, dates, actualités traduites,
explications du biais), widgets du tableau de bord (ordre par glisser-déposer, souris,
tactile ou clavier ; visibilité ; largeur), classes d'actifs. Enregistré dans
`parametres_utilisateur`.

Apparence, sur le modèle des réglages d'un iPhone (`src/lib/theme.ts`, CSS généré par
utilisateur) :

- 7 styles : Deepwater, iPhone (couleurs système d'iOS, police SF, cartes sans bordure),
  Graphite (macOS), Nord, Océan, Terminal (toujours sombre), Papier (toujours clair) ;
- clair, sombre ou automatique (suit le réglage de l'appareil) ;
- couleur d'accent (couleurs système de l'iPhone ou personnalisée), police (Geist,
  système, serif, chasse fixe), angles, surfaces (bordures, ombres, verre dépoli) ;
- taille du texte (6 crans), texte en gras, augmenter le contraste (couleurs système à
  contraste élevé pour le style iPhone), réduire la transparence, réduire les animations.

Sur iPhone : Safari, Partager, « Sur l'écran d'accueil » ouvre Deepwater en plein écran
(icône et manifeste publics) ; le contenu respecte l'encoche et la Dynamic Island.

## Biais quotidien (S&P 500, Nasdaq-100)

Scoring automatique basé sur des règles, pas une prédiction garantie ni un conseil en
investissement. Règles : `supabase/functions/calcul-biais/regles.ts`.

| Facteur | Donnée | Poids S&P 500 / Nasdaq-100 |
|---|---|---|
Uniquement des données concrètes, aucune analyse technique (règles du 19/10/2026).

| Facteur | Donnée | Poids S&P 500 / Nasdaq-100 |
|---|---|---|
| Politique de la Fed | ce que le marché anticipe (taux à 2 ans contre taux effectif des Fed funds, 60 %) et sens de la dernière décision de moins de 200 jours (40 %) ; hausse = baissier | 25 % / 25 % |
| Taux longs | moitié variation sur 5 séances (taux à 10 ans 60 %, taux réel à 10 ans 40 %), moitié niveau du taux réel à 10 ans face à un repère neutre fixe de 1,5 % (1 pt au-dessus = note −1) | 20 % / 25 % |
| Surprise macro | publications des 45 derniers jours comparées aux précédentes | 20 % / 15 % |
| Appétit pour le risque | VIX (ou VXN) face à sa médiane d'un an et sur 5 séances ; spread haut rendement sur 5 séances | 20 % / 20 % |
| Conditions financières | NFCI de la Fed de Chicago : niveau (60 %) et variation sur 4 semaines (40 %) | 15 % / 15 % |

Note de −1 à +1 par facteur, moyenne pondérée, haussier ≥ +0,2, baissier ≤ −0,2.
Facteur sans donnée récente : « indisponible », poids retiré ; pas de biais avec moins de
la moitié du poids. Le cours de l'indice n'entre plus dans le calcul. Calcul unique pour tous, depuis la base
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
  (51 contrôles avec deux comptes de test).
- Webhook Clerk signé et idempotent : `npm run test:webhook`.
- Fuites de secrets : `npm run build` lance `scripts/verifier-secrets.mjs`.
- Edge Functions et analyses : `npx deno test --allow-read supabase/functions` (filtres, calendriers, macro mondiale, analyses,
  biais, Alpha Vantage).
