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
| Cours en séance (indices au comptant, devises, matières premières) | aucune source officielle gratuite ; l'API non officielle de Yahoo Finance fonctionne mais contrevient à ses conditions d'utilisation (écartée). Contrats à terme ES et NQ : Massive (offre gratuite, décalée de 8 h), utilisé pour juger le biais par session |
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
- **Force des 8 devises** (sept facteurs) : portage, taux directeur face à la moyenne des 8
  (13 %) ; taux réel, taux directeur moins inflation (13 %) ; orientation de la banque
  centrale (18 %) ; croissance et emploi, PIB, évolution du chômage et chiffres face au
  consensus sur 30 jours (14 %) ; sentiment risk-on/risk-off (12 %, devises de risque AUD,
  NZD, CAD contre refuges JPY, CHF, USD) ; positionnement COT des fonds à effet de levier,
  centile sur 3 ans, lecture contrarienne (12 %, sauf USD) ; corrélations inter-marchés
  (18 %, fiche « Value Asset Corrélations » d'Aupa Traders) :
  pétrole → CAD, or → CHF et JPY, S&P 500 → AUD et NZD (CHF à l'inverse), yuan → AUD,
  dollar → CAD (même sens) et EUR, JPY, AUD, NZD (sens inverse), euro → GBP, AUD → NZD.
  Actifs moteurs mesurés par leur variation sur 20 séances (pétrole ±10 %, or et S&P 500
  ±5 %, yuan ±1,5 % = note pleine) ; devises moteurs par leur score fondamental, jamais par
  leur cours. Le dollar n'a pas de moteur dans la fiche : facteur indisponible pour l'USD.
- **Paires** : devise forte contre devise faible ; étoiles = nombre des sept facteurs qui
  vont dans le même sens (7 étoiles : tous).
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

Uniquement des données concrètes, aucune analyse technique (règles du 20/10/2026,
version `2026-10-20b`).

### Méthode : l'analyse de la liste à feux tricolores

Le biais est l'analyse des informations de la liste de l'utilisateur. Chaque élément
disponible en base donne une note de −1 (baissier) à +1 (haussier), pondérée par sa couleur :
🔴 3, 🟠 2, 🟢 1. Le score est la moyenne pondérée des facteurs disponibles. Haussier dès
+0,2, baissier sous −0,2.

Lecture « priced in » (🔴 mécanisme d'anticipation, « priced in », misprice et repricing) :
ce qui compte est ce qui change face aux attentes (surprise face au consensus, révision des
anticipations, variation récente), pas le niveau, déjà dans les prix. Les niveaux restent
cités dans les explications. Chaque élément est lu de façon classique.

| Couleur | Facteur | Éléments de la liste | Donnée et lecture |
|---|---|---|---|
| 🔴 | Anticipations de la Fed | taux directeurs, hawkish / dovish ; 🟠 anticipations de taux, mandat | révision sur 5 séances des taux à 1 et 2 ans (+15 pb = −1) ; niveau face aux Fed funds et dernière décision cités |
| 🔴 | Statistiques face au consensus | CPI, PCE, PIB, NFP, chômage ; 🟠 PPI, salaires, PMI, ventes au détail, consensus | surprises face au consensus sur 30 jours (60 %), publications FRED face aux précédentes (40 %) |
| 🔴 | Obligations d'État | Treasuries, Bunds, yields ; 🟠 rendements réels | variation sur 5 séances du 10 ans US (50 %), du réel (25 %), du taux européen AAA (BCE, proche du Bund, 25 %) : hausse = baissier |
| 🔴 | Dollar et différentiel de taux | DXY, yield spread | indice large du dollar sur 20 séances (70 %), écart 10 ans US − zone euro (30 %) : dollar qui monte = baissier |
| 🔴 | Pétrole | WTI / Brent | WTI sur 20 séances (+15 % = −1) |
| 🔴 | Liquidité | M2 et liquidité mondiale ; 🟠 QE / QT | liquidité nette de la Fed sur 4 semaines (70 %), M2 sur 1 an (30 %) ; bilan cité (QE, QT ou stable au-delà de 25 Md$) |
| 🔴 | Régime macroéconomique | régimes ; 🟢 cycle, indicateurs avancés / retardés | croissance (emplois, chômage, PIB) × inflation (PCE face à 2 %, CPI, pétrole sur 3 mois) |
| 🟠 | Sentiment risk-on / risk-off | risk-on / risk-off, valeurs refuges (or, yen, franc suisse) | VIX (35 %), VIX / VIX3M (15 %), spread haut rendement (25 %), refuges sur 5 séances (25 %) : risk-off = baissier |
| 🟠 | Courbe des taux | inversion de la courbe | 10 ans − 2 ans et 10 ans − 3 mois : inversion = baissier |
| 🟢 | Positionnement des institutionnels | COT, banques et institutionnels | contrats nets des gérants d'actifs sur 4 semaines, rapportés à l'intérêt ouvert actuel (le roulement trimestriel gonfle l'intérêt ouvert) |

Hors score, affichés comme contexte : conditions financières (NFCI, hors liste) et chiffres
publiés depuis la dernière clôture de New York (toutes économies ; les américains sont déjà
dans les statistiques). Sans donnée gratuite en base, donc non comptés : projections (SEP)
et discours du FOMC, « buy the rumor, sell the news », géopolitique, politique fiscale et
dette, rotations sectorielles, sentiment des particuliers, ratios de valorisation.

Facteur sans donnée récente : « indisponible », poids retiré ; pas de biais avec moins de
la moitié du poids. Calcul unique pour tous, depuis la base seulement. Chaque version des
règles est enregistrée telle quelle (`regles_versions`, page Admin).

### Résultat rejoué (version 2026-10-20b, clôture à clôture)

| | Séances | Hausse spontanée | Haussier juste | Baissier juste | Corrélation score / séance |
|---|---|---|---|---|---|
| S&P 500 2021-2023 | 753 | 51,5 % | 59,9 % (152) | 55,2 % (181) | +0,09 |
| S&P 500 2024-2026 | 701 | 55,5 % | 54,7 % (53) | 44,5 % (137) | +0,03 |
| Nasdaq-100 2021-2023 | 753 | 53,0 % | 55,0 % (151) | 51,9 % (181) | +0,07 |
| Nasdaq-100 2024-2026 | 700 | 57,0 % | 61,8 % (55) | 43,2 % (139) | +0,04 |

Lecture franche : l'analyse de la liste annonçait bien la séance en 2021-2023 (marché mené
par l'inflation et les hausses de taux). En 2024-2026, elle est à peine meilleure que le
hasard, et ses biais baissiers ne le sont pas du tout : le marché a monté malgré des taux,
un dollar ou un pétrole en hausse. Facteur par facteur (S&P 500), seuls les anticipations de la
Fed, les statistiques face au consensus et le pétrole vont dans le bon sens sur les deux
périodes. Les obligations d'État ne marchent que sur 2021-2023. Le dollar et la courbe vont
légèrement à contre-sens sur les deux périodes. Le COT des gérants n'existe en base que
depuis septembre 2023.

La version d (19/10/2026), calée sur ces statistiques, faisait mieux sur 2024-2026. Elle
mettait cependant à zéro la plupart des 🔴 de la liste : l'utilisateur l'a écartée.

### Biais intraday

Un biais par séance, pour l'intraday : la séance de New York de 9 h 30 à 16 h (contrats à
terme S&P 500 ES et Nasdaq-100 NQ), calculé automatiquement chaque jour ouvré à 9 h 05
(heure de New York), après les chiffres américains de 8 h 30. Le bouton « Calculer
maintenant » recalcule le biais de la séance visée (celle du jour avant 16 h, sinon la
suivante). Le contexte liste les chiffres publiés face au consensus depuis la dernière
clôture de New York (nuit asiatique et européenne comprises). Les biais Asie et Londres
essayés le 19/10/2026 ont été retirés à la demande de l'utilisateur.

Le rejeu ci-dessus juge le biais de clôture à clôture (seules clôtures disponibles sur
FRED). Pour le juger en intraday, `collecte-sessions` lit les barres de 30 minutes des
contrats ES et NQ chez **Massive** (offre gratuite « Futures Basic » : données décalées de
8 heures, 2 ans d'historique, 5 appels par minute ; contrat le plus proche, roulement le
jeudi 8 jours avant l'échéance) et enregistre l'ouverture et la clôture de chaque session
(`cours_sessions` ; la séance de New York sert au jugement intraday, l'Asie et Londres sont
conservées pour analyse). Clé `massive_api_key` dans le Vault : la collecte démarre seule
dès qu'elle y est (rattrapage d'un trimestre par heure, puis les 7 derniers jours à 5 h,
17 h et 22 h UTC).

### Historique de performance

Mode `historique` de `calcul-biais` (`{"mode":"historique","annee":2024,"trimestre":1}`) :
les règles en vigueur rejouées séance par séance avec uniquement ce qui était publié avant
la séance (délais de publication de chaque série dans `historique.ts`), avec la note de
chaque facteur et les mesures brutes (`historique_biais.notes`) pour mesurer ce que chaque
donnée annonce. Un trimestre par appel (limite de calcul des Edge Functions). Rejoué de
2021 à 2026 : la macro américaine en base ne remonte qu'à octobre 2020. Limites : séries
FRED révisées (pas les premières estimations) ; pas d'historique du consensus.

## Données fondamentales (`collecte-fondamentaux`, `collecte-marches`)

- **Anticipations de taux** : bons du Trésor à 1, 3 et 6 mois, taux à 1 et 2 ans (FRED
  DGS1MO, DGS3MO, DGS6MO, DGS1, DGS2) contre Fed funds effectif (DFF) ; taux à terme entre
  deux échéances pour chaque réunion du FOMC. Approximation des futures sur Fed funds
  (non gratuits), décalée de quelques points de base.
- **Prime de terme à 10 ans** : modèle Kim-Wright de la Fed (THREEFYTP10), hebdomadaire.
- **Zone euro** : courbe AAA de la BCE à 2 et 10 ans (API de données de la BCE, YC),
  chaque jour ouvré à 16 h 45 UTC.
- **Liquidité** : bilan de la Fed (WALCL), compte du Trésor (WTREGEN), prises en pension
  inversées (RRPONTSYD), M2 (M2SL).
- **COT** : CFTC, Traders in Financial Futures (jeu gpe5-46if, sans clé), le lundi et le
  samedi ; 10 contrats (E-mini S&P 500 et Nasdaq-100, 10 ans, 7 devises).
- **Consensus** : titres du fil instantané au format FinancialJuice (« Actual … (Forecast …,
  Previous …) ») ou InvestingLive (« … vs … expected »), toutes les 15 minutes ; rien n'est
  retenu sans consensus chiffré.
- **Alertes de marché** (même webhook que les alertes de fonctionnement) : VIX ≥ 25,
  structure VIX / VIX3M inversée, spread haut rendement +0,3 pt en 5 séances, changement de
  biais, surprise américaine d'au moins 80 sur 100.

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
