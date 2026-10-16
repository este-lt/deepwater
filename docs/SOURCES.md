# Sources de données et limites réelles

Deepwater n'affiche que des données collectées auprès des sources ci-dessous. Quand une
donnée n'existe pas gratuitement, elle est marquée « indisponible » à l'écran, et le
manque est expliqué ici. Rien n'est en temps réel : chaque bloc affiche l'heure de sa
dernière mise à jour et passe en orange quand la donnée est plus ancienne que prévu.

Heures : tout est stocké en UTC et affiché dans le fuseau du navigateur. Les heures
officielles (annonce de la Fed à 14 h 00 à New York, de la BCE à 14 h 15 à Francfort)
sont converties avec le changement d'heure de la ville concernée.

## Indices S&P 500 et Nasdaq-100

| | |
|---|---|
| Source | FRED (Federal Reserve Bank of St. Louis), séries `SP500` et `NASDAQ100`, export CSV |
| Fréquence | toutes les 3 heures (`collecte-indices`) ; FRED publie la clôture du jour le lendemain ouvré |
| Contenu | clôture quotidienne uniquement (pas d'ouverture, de plus haut ni de plus bas) |
| Calculs | moyennes mobiles 20 et 50 jours calculées en SQL, vérifiées contre le CSV brut |
| Contrainte | FRED refuse les navigateurs génériques : la requête s'identifie (`User-Agent` Deepwater) |

Alpha Vantage `INDEX_DATA` donnerait les mêmes indices mais c'est un endpoint payant.
Le réglage `av_premium` (page admin) bascule automatiquement sur Alpha Vantage le jour
où un abonnement est pris.

## Alpha Vantage (offre gratuite)

- **25 requêtes par jour** et au plus une par seconde. Le compteur est tenu en base
  (`quota_api`), remis à zéro à minuit UTC.
- Priorités : la priorité 1 (taux 2, 10 et 30 ans, taux directeur) peut utiliser les
  25 appels ; la priorité 2 laisse toujours 3 appels en réserve ; la priorité 3 en laisse 8.
- Collecteur unique (`collecte-av`, toutes les 15 min) : au plus 4 appels par passage,
  15 s entre deux appels, verrou pour qu'une même donnée ne soit jamais demandée deux fois.
  Les utilisateurs ne déclenchent jamais d'appel : ils lisent la base.
- Les réponses « Note » ou « Information » (limite atteinte, endpoint payant, rafale)
  ne sont jamais mises en cache. Seule la limite quotidienne bloque la source jusqu'à
  minuit UTC ; une rafale est réessayée 15 min plus tard ; un endpoint payant est marqué
  « indisponible » et réessayé une semaine plus tard.
- Endpoints payants constatés : `INDEX_DATA`, `OVERVIEW`. Les ratios d'entreprise sont
  donc calculés à partir des états financiers (douze derniers mois glissants).

Données utilisées : taux du Trésor américain (3 mois à 30 ans), taux directeur de la Fed,
CPI, chômage, emplois non agricoles, PIB réel, pétrole WTI et Brent, gaz naturel, cuivre,
change (optionnel), actions AAPL et MSFT (optionnelles), actualités `NEWS_SENTIMENT`.

## SEC EDGAR

- `User-Agent` identifiant envoyé à chaque requête, 10 requêtes par seconde au maximum,
  pause et nouvel essai sur les réponses 403 et 429.
- Formulaires 4 (initiés) : différé légal de 2 jours ouvrés. Seuls les achats (code P)
  et ventes (code S) sur le marché sont comptés ; attributions, exercices d'options et
  retenues fiscales sont exclus.
- Formulaires 13F (11 gérants suivis) : photographie en fin de trimestre, publiée jusqu'à
  45 jours après. Les options (put/call) sont exclues.
- Fondamentales : API XBRL `companyconcept`, exercices rapprochés à 7 jours près
  (Apple clôt un samedi).

## Veille d'actualités

Flux RSS relus toutes les 30 minutes (`collecte-rss`) :

| Source | Flux | Remarque |
|---|---|---|
| WSJ Marchés | `feeds.content.dowjones.io/public/rss/RSSMarketsMain` | l'ancien flux `feeds.a.dj.com` est figé depuis janvier 2025 |
| FT Marchés, FT Europe | `ft.com/markets?format=rss`, `ft.com/world/europe?format=rss` | le FT répond 403 aux navigateurs génériques, accepte un `User-Agent` honnête ; FT Europe est surtout politique, donc très filtré |
| CNBC Marchés, CNBC Économie | flux `search.cnbc.com` 20409666 et 20910258 | |
| Fed | `federalreserve.gov/feeds/press_monetary.xml` | seuls les communiqués du FOMC, procès-verbaux et projections sont gardés |
| BCE | `ecb.europa.eu/rss/press.html` | seules les décisions et comptes rendus de politique monétaire sont gardés |

S'y ajoutent deux requêtes Alpha Vantage `NEWS_SENTIMENT` toutes les 12 heures
(thèmes marchés financiers et politique monétaire). Leur heure de publication est
fournie sans fuseau ; elle est traitée comme UTC.

Reuters et Bloomberg n'ont plus de flux RSS public gratuit : ils ne sont pas utilisés.

**Stockage** : titre, lien, date, source et extrait de 280 caractères au plus. Le texte
complet des articles n'est jamais récupéré. Un même titre repris par deux sources n'est
stocké qu'une fois. Un flux en panne est journalisé et ignoré, sans bloquer les autres.

**Filtre** (`supabase/functions/_shared/filtre-actualites.ts`, règles modifiables) :
un article est gardé s'il relève d'une de ces catégories : décision de banque centrale,
statistique macro publiée, mouvement de marché (toute séance pour les actions et indices,
mouvements forts seulement pour taux, devises et matières premières, rien sous 2 %),
résultats, fusion-acquisition, initiés et institutions. Sont rejetés : formulations au
conditionnel, rumeurs, analyses et tribunes (titres en question, « pourquoi… »,
« voici comment… »), conseils personnels, faits divers, culture, politique.

**Validation** : 203 articles réels triés à la main avant d'exécuter le filtre, en trois
lots. Avant ajustement, le filtre était d'accord avec le tri manuel sur 95,9 % (71/74) et
93,3 % (42/45) des deux lots de contrôle. Après correction de règles générales (jamais
d'exception par titre), il est d'accord sur 100 % des trois lots (84/84, 74/74, 45/45).
Ces lots ayant servi à l'ajustement, le taux réel sur de nouveaux articles sera un peu
plus bas. Les cas types sont repris dans les tests (`filtre-actualites.test.ts`).
Les lots d'articles ne sont pas versionnés (droits des éditeurs).

## Calendrier économique

- **Réunions de banques centrales** : dates officielles relevées le 16 octobre 2026 sur
  federalreserve.gov et ecb.europa.eu. Les dates FOMC 2027 sont provisoires et signalées
  comme telles jusqu'à confirmation par la Fed.
- **Publications** (CPI, chômage, emplois non agricoles, PIB) : détectées quand une
  nouvelle période apparaît dans la série Alpha Vantage. La date affichée est le jour de
  détection, pas l'heure exacte de publication ; au tout premier chargement, la date de
  publication est inconnue et l'écran le dit.
- **Consensus des économistes : indisponible.** Aucune source gratuite fiable. L'écart
  affiché compare chaque publication à la précédente, et c'est cette « surprise » que le
  biais quotidien utilise.
- **Dates des prochaines publications statistiques : indisponibles** (non collectées).

## Biais quotidien (S&P 500, Nasdaq-100)

Scoring automatique basé sur des règles, pas une prédiction garantie ni un conseil en
investissement. Règles modifiables dans `supabase/functions/calcul-biais/regles.ts`.

| Facteur | Donnée utilisée | Poids S&P 500 / Nasdaq-100 |
|---|---|---|
| Tendance | clôture face aux moyennes mobiles 20 et 50 jours (FRED) | 35 % / 35 % |
| Taux longs | taux à 10 ans : variation sur 5 séances et écart à sa moyenne d'un an | 25 % / 30 % |
| Surprise macro | dernière publication (inflation, chômage, emplois, PIB) comparée à la précédente, si détectée dans les 45 derniers jours | 20 % / 15 % |
| Flux | ventes et achats d'initiés déposés en 7 jours face à la moyenne des 13 semaines précédentes, et variation des 13F déposés en 7 jours | 20 % / 20 % |

- Chaque facteur donne une note de −1 à +1 ; le score est leur moyenne pondérée,
  converti en haussier (≥ +0,2), baissier (≤ −0,2) ou neutre. Les 2 ou 3 facteurs qui ont
  le plus pesé sont affichés avec leurs chiffres et leurs sources.
- Un facteur sans donnée récente est « indisponible » et son poids est retiré ; le biais
  n'est pas publié sans le cours de l'indice ou avec moins de la moitié du poids total.
- Le Nasdaq-100 ne compte que les flux des 10 grandes valeurs suivies qui en font partie.
- Calcul unique pour tous les utilisateurs, à partir des données en base uniquement.
  Automatisation coupée par défaut ; quand au moins un utilisateur l'active, le calcul
  part à 8 h 30 heure de New York (deux créneaux UTC, un seul passe selon l'heure d'été).
  Les jours fériés boursiers américains ne sont pas gérés.
- Bouton de calcul manuel : un calcul toutes les 5 minutes par compte, 60 par heure au
  total. Un recalcul sur des données inchangées ne crée pas de nouvelle version.
- Chaque version reste en base (statut « remplace ») avec les validations qui s'y
  rapportent ; chaque utilisateur ne voit que ses propres validations.

## Données non disponibles

| Donnée | Raison |
|---|---|
| Prix en temps réel | aucune source gratuite ; l'application n'affiche que des clôtures |
| Indices européens | hors périmètre (choix du propriétaire) ; l'actualité européenne reste suivie |
| Consensus des prévisions macro | payant partout |
| Ratios Alpha Vantage `OVERVIEW` | endpoint payant ; ratios recalculés depuis les états financiers |
| Ouverture, plus haut, plus bas des indices | FRED ne publie que la clôture |
