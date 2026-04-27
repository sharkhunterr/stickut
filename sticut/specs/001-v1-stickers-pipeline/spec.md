# Feature Specification: V1 Stickers Pipeline

**Feature Branch**: `001-v1-stickers-pipeline`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "Stickut V1 — full pipeline: upload, cutout, white border, A4 layout, decorative frames, PNG export"

## Clarifications

### Session 2026-04-27

- Q: Que doit-il se passer si l'utilisateur rafraîchit ou ferme/réouvre l'onglet pendant qu'il a des images uploadées ou des cutouts en cours dans la session courante ? → A: Session purement éphémère — au refresh, l'état est perdu ; l'utilisateur re-dépose ses fichiers (le cache rend le détourage instantané pour les mêmes images).
- Q: Quand un second utilisateur lance un lot pendant que le pool de détourage est déjà occupé par un premier utilisateur, que voit-il ? → A: File globale FIFO avec étape « En attente » — ses images affichent ce libellé jusqu'à ce que leur place arrive, puis reprennent les étapes normales ; aucune information sur les autres utilisateurs n'est exposée.
- Q: Le cache de cutouts est-il global (partagé entre tous les utilisateurs du déploiement) ou scopé par utilisateur ? → A: Global par hash — un seul fichier `{hash}_{modèle}.png` partagé entre toutes les sessions ; un cutout calculé par un utilisateur est réutilisé par les autres si le contenu est identique. Posture homelab familial pré-authentifié.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Produire une planche A4 imprimable à partir de mes photos (Priority: P1)

L'utilisateur dépose une ou plusieurs photos depuis son téléphone ou son
ordinateur. Stickut détoure automatiquement chaque image, applique un contour
blanc arrondi de qualité, agence les stickers sur une feuille A4, et propose
un téléchargement PNG 300 DPI compatible avec Cricut Design Space en mode
Print Then Cut.

**Why this priority** : c'est la promesse fondamentale du produit. Sans ce
flux complet, Stickut n'a aucune utilité. Tout le reste est un raffinement.

**Independent Test** : un utilisateur dépose 5 photos hétérogènes, lance le
traitement avec les réglages par défaut, télécharge la planche, l'ouvre dans
Cricut Design Space, lance un Print Then Cut. Si la machine imprime puis
découpe les contours correctement, l'histoire est validée.

**Acceptance Scenarios** :

1. **Given** je suis sur la page d'accueil, **When** je glisse-dépose 5 photos
   JPEG, **Then** elles apparaissent dans la liste avec un statut « en
   attente » et un bouton « Lancer le traitement » devient actif.
2. **Given** 5 images sont uploadées, **When** je clique sur « Lancer le
   traitement », **Then** chaque image passe par les étapes de détourage et
   de génération de contour, et un aperçu A4 s'affiche au fur et à mesure.
3. **Given** au moins un sticker est prêt, **When** je clique sur « Exporter
   A4 », **Then** un fichier PNG nommé `stickut_AAAA-MM-JJ_HHMM.png` est
   téléchargé.
4. **Given** une PNG déjà transparente est uploadée, **When** je lance le
   traitement, **Then** l'étape de détourage est sautée et seul le contour
   blanc est appliqué.
5. **Given** la même image a déjà été traitée précédemment, **When** je la
   re-uploade, **Then** le détourage retourne instantanément (cache hit) sans
   nouvelle inférence.

---

### User Story 2 - Maîtriser la taille des stickers (Priority: P2)

L'utilisateur règle la taille de ses stickers selon deux modes : tous au même
gabarit (taille fixe), ou variable dans une plage min–max pour optimiser le
remplissage de la feuille.

**Why this priority** : sans ce contrôle, l'utilisateur subit la mise en page
et gâche du papier. La taille est le réglage le plus immédiat après l'upload.

**Independent Test** : l'utilisateur uploade 8 photos, bascule entre les deux
modes via un toggle, observe le ré-agencement instantané de l'aperçu A4 et
constate que les deux modes produisent des layouts visiblement différents et
cohérents (pas de chevauchement, pas de débordement non signalé).

**Acceptance Scenarios** :

1. **Given** des images sont prêtes, **When** je suis en mode « Taille fixe »
   avec slider à 50 mm, **Then** tous les stickers ont leur côté le plus long
   égal à 50 mm.
2. **Given** des images sont prêtes, **When** je passe en mode « Plage » avec
   bornes 30–60 mm, **Then** les stickers prennent des tailles variées dans
   cet intervalle pour mieux remplir la feuille.
3. **Given** le slider de contour blanc est à 2,5 mm, **When** je le déplace
   à 5 mm, **Then** l'aperçu A4 et chaque vignette se mettent à jour en moins
   de 100 ms (instantané perçu).
4. **Given** la combinaison taille + contour fait déborder un sticker hors de
   la zone imprimable, **Then** le sticker concerné est surligné en rouge dans
   la liste et exclu de l'export PNG.

---

### User Story 3 - Suivre le traitement en temps réel (Priority: P2)

L'utilisateur voit pour chaque image l'étape en cours (Décodage, Détourage IA,
Génération du contour, Mise en page, Terminé) et une barre de progression
globale. Un échec sur une image ne bloque pas les autres et un message en
français explique l'erreur.

**Why this priority** : le détourage prend plusieurs secondes par image. Sans
feedback, l'utilisateur croit l'application figée et la quitte.

**Independent Test** : l'utilisateur uploade 20 images, observe la barre
globale qui progresse de manière monotone, et voit le nom d'étape de chaque
image changer dans l'ordre attendu. Si une image échoue (ex : fichier
corrompu), elle affiche un message d'erreur sans interrompre les autres.

**Acceptance Scenarios** :

1. **Given** 10 images sont en cours de traitement, **When** j'observe la
   liste, **Then** chaque ligne affiche un libellé d'étape qui se met à jour
   en temps réel.
2. **Given** une image lève une erreur de décodage, **When** elle échoue,
   **Then** sa carte affiche un message d'erreur en français et le traitement
   continue pour les autres.
3. **Given** toutes les images ont fini, **When** la barre globale atteint
   100 %, **Then** un état final récapitulatif s'affiche (`N traitées,
   M échouées`).

---

### User Story 4 - Valider visuellement avant impression (Priority: P3)

Pour chaque image, l'utilisateur voit côte à côte une miniature « avant »
(image originale) et une miniature « après » (image détourée avec contour
blanc, sur damier transparent). Il peut zoomer en plein écran sur n'importe
quelle vignette, notamment sur mobile (pinch-zoom).

**Why this priority** : l'utilisateur a besoin de vérifier que le détourage
n'a pas mangé un détail important avant de gâcher du papier et de la feuille
de transfert. C'est la principale ligne de défense contre une mauvaise
impression.

**Independent Test** : l'utilisateur uploade une photo avec sujet complexe
(cheveux, fourrure, contour découpé), voit immédiatement le résultat « après »
en miniature, puis tape dessus pour zoomer plein écran et inspecter les bords.

**Acceptance Scenarios** :

1. **Given** une image est traitée, **When** je consulte sa carte, **Then**
   je vois deux miniatures côte à côte (avant à gauche, après à droite, sur
   damier transparent).
2. **Given** je suis sur mobile, **When** je tape sur une miniature, **Then**
   un modal plein écran s'ouvre et je peux zoomer en pinch-zoom.
3. **Given** je modifie un paramètre (taille, contour, cadre), **When** la
   modification est appliquée, **Then** les miniatures « après » et l'aperçu
   A4 se mettent à jour automatiquement.

---

### User Story 5 - Habiller la planche d'un cadre décoratif et d'un titre (Priority: P3)

L'utilisateur choisit un cadre décoratif parmi une bibliothèque visuelle
(étoiles & confettis, arc-en-ciel, vagues, traces de dinos, stand de fête,
guirlande de fanions, festons), choisit sa couleur principale, et saisit un
titre d'en-tête (ex : « Anniversaire Léa ») qui apparaît en haut de la
planche imprimée. Il peut aussi choisir « Sans cadre ».

**Why this priority** : transforme une planche utilitaire en cadeau
personnalisé. Crée la valeur émotionnelle au-delà du simple sticker.

**Independent Test** : l'utilisateur traite 6 photos d'anniversaire, choisit
le cadre « Stand de fête », met la couleur principale en magenta, tape
« Anniversaire Léa » dans le champ titre, voit l'aperçu A4 se mettre à jour
en direct avec ces choix appliqués, et exporte le PNG final.

**Acceptance Scenarios** :

1. **Given** la bibliothèque de cadres est ouverte, **When** je sélectionne
   un cadre, **Then** son rendu (avec couleur courante) apparaît en overlay
   dans l'aperçu A4 et l'agencement des stickers se restreint à la zone
   imprimable du cadre.
2. **Given** un cadre est sélectionné, **When** je change la couleur dans le
   color picker, **Then** tous les éléments décoratifs marqués comme
   « couleur principale » dans le cadre adoptent cette couleur en moins de
   100 ms.
3. **Given** un cadre est sélectionné et il supporte un titre, **When** je
   saisis du texte dans le champ « Titre », **Then** ce texte remplace le
   placeholder dans l'en-tête et adopte la couleur principale.
4. **Given** un cadre est sélectionné, **When** je vide le champ « Titre »,
   **Then** l'élément d'en-tête disparaît du rendu.
5. **Given** le mode « Sans cadre » est sélectionné, **Then** les stickers
   utilisent toute la zone A4 moins les marges extérieures globales.
6. **Given** je clique sur « Exporter A4 » avec un cadre actif, **Then** le
   PNG exporté inclut le cadre rasterisé en arrière-plan avec la couleur et
   le titre choisis.

---

### User Story 6 - Ajouter mes propres cadres en tant qu'admin (Priority: P4)

L'admin du serveur dépose un fichier SVG dans le dossier de templates monté
en volume. Au prochain rafraîchissement de l'UI, ce nouveau cadre apparaît
dans la bibliothèque sans redémarrage du conteneur. Si le SVG est invalide,
il est ignoré sans casser le service.

**Why this priority** : extensibilité majeure du produit, mais pas un
prérequis V1 — les 7 cadres fournis suffisent à valider l'expérience. Cette
histoire dépend de US-5 (mécanisme de cadres existant).

**Independent Test** : l'admin SSH sur l'hôte, copie un nouveau SVG conforme
au format documenté dans `./templates/`, recharge l'UI dans le navigateur, et
voit son cadre apparaître dans le sélecteur, fonctionnel (couleur + titre
applicables).

**Acceptance Scenarios** :

1. **Given** un fichier SVG conforme est ajouté au dossier `templates`,
   **When** l'UI rafraîchit la liste, **Then** le nouveau cadre apparaît dans
   le sélecteur avec une miniature.
2. **Given** un fichier SVG malformé ou non conforme est ajouté, **Then** il
   est ignoré, un avertissement est journalisé, et le service reste
   fonctionnel.
3. **Given** un cadre est sélectionné après ajout à chaud, **Then** la
   personnalisation (couleur, titre) fonctionne identiquement aux cadres
   livrés.

---

### Edge Cases

- **Format d'upload non supporté** (ex : `.svg`, `.psd`, `.raw`) : refus
  gracieux avec message en français indiquant les formats acceptés.
- **Image déjà transparente** : le détourage est sauté ; seul le contour
  blanc est appliqué.
- **Fichier corrompu ou tronqué** : échec isolé sur cette image avec message
  d'erreur lisible ; les autres continuent.
- **Fichier dépassant la taille maximale** : refus à l'upload avec un message
  indiquant la limite (par défaut 20 Mo).
- **Tous les stickers débordent** (réglages incompatibles : trop gros, marges
  trop fortes) : aucun export possible, l'utilisateur est invité à réduire la
  taille.
- **Connexion réseau interrompue pendant le traitement** : l'état serveur est
  préservé ; la reprise du flux SSE est possible ; en cas de fermeture, les
  fichiers temporaires sont purgés après une heure.
- **Cache disque saturé** : l'utilisateur a accès à un bouton de purge depuis
  les paramètres avancés.
- **Template SVG sans `sticker-area` valide** : ignoré au chargement avec
  warning ; n'apparaît pas dans la bibliothèque.
- **Couleur saisie invalide** dans le color picker : la valeur précédente est
  conservée.
- **Titre dépassant la longueur maximale** : le champ rejette les caractères
  au-delà de 60.
- **Session abandonnée ou onglet rafraîchi** : la session est purement
  éphémère côté navigateur — aucun état n'est conservé en `localStorage`,
  cookie ou base. Si l'utilisateur rafraîchit ou ferme l'onglet, sa liste
  d'images en cours est perdue et il doit les redéposer ; le cache de
  cutouts rend ce redépôt quasi-instantané pour les mêmes fichiers. Les
  fichiers temporaires d'upload côté serveur sont purgés après une heure ;
  les cutouts cachés persistent (bénéfice utilisateur futur).
- **Multiples utilisateurs simultanés sur le même conteneur** : chacun a sa
  propre session isolée ; le cache de cutouts est partagé (bénéfice : un
  utilisateur profite des cutouts déjà calculés par un autre).

## Requirements *(mandatory)*

### Functional Requirements

#### Upload & ingestion

- **FR-001** : Le système MUST accepter en upload les formats JPEG, PNG,
  WebP, GIF, BMP, TIFF, HEIC, HEIF et AVIF.
- **FR-002** : Le système MUST permettre l'upload simultané de plusieurs
  fichiers en une seule action (glisser-déposer ou sélection multiple).
- **FR-003** : Le système MUST limiter la taille maximale par fichier (par
  défaut 20 Mo) et le nombre maximum de fichiers par session (par défaut 50),
  ces limites étant configurables par l'admin via variable d'environnement.
- **FR-004** : Le système MUST valider le format réel de chaque fichier par
  inspection de son contenu (magic bytes), pas uniquement l'extension.
- **FR-005** : En cas de refus, le système MUST retourner un message d'erreur
  en français lisible directement par l'utilisateur.

#### Détourage automatique

- **FR-006** : Le système MUST détourer automatiquement chaque image
  uploadée à l'aide d'un modèle de segmentation par IA (par défaut un modèle
  qualité maximale ; au moins trois modèles alternatifs disponibles dans les
  paramètres avancés couvrant un compromis qualité/vitesse).
- **FR-007** : Le système MUST détecter automatiquement si une image est
  déjà détourée (transparence existante significative) et, le cas échéant,
  sauter l'étape de détourage.
- **FR-008** : Le système MUST mettre en cache le résultat du détourage par
  empreinte (hash de contenu + nom du modèle) afin qu'un re-traitement de la
  même image avec le même modèle soit instantané. Ce cache est global au
  déploiement : il est partagé entre toutes les sessions et tous les
  utilisateurs authentifiés (un cutout calculé par un membre du foyer est
  réutilisé immédiatement si un autre membre uploade la même image). Aucun
  identifiant utilisateur n'est intégré à la clé de cache.
- **FR-009** : L'utilisateur MUST pouvoir, depuis l'UI, vider intégralement
  le cache de détourage.
- **FR-010** : Le système MUST proposer une option « alpha matting » dans
  les paramètres avancés pour améliorer les bords sur cheveux/fourrure.

#### Contour blanc

- **FR-011** : Le système MUST générer autour de chaque image détourée un
  contour blanc à coins arrondis, sans crénelage visible.
- **FR-012** : L'épaisseur du contour MUST être réglable de 0,5 mm à 8 mm
  via un slider, avec une valeur par défaut de 2,5 mm.
- **FR-013** : Tout changement d'épaisseur MUST être reflété visuellement
  dans toutes les vignettes « après » et l'aperçu A4 en moins de 100 ms.

#### Dimensionnement & layout

- **FR-014** : Le système MUST proposer un mode « Taille fixe » (un seul
  slider, plage 15–120 mm, défaut 50 mm) qui contraint le côté le plus long
  de chaque sticker.
- **FR-015** : Le système MUST proposer un mode « Plage » (deux sliders min
  et max dans 15–120 mm, défaut 30–60 mm) qui module la taille de chaque
  sticker pour optimiser le remplissage A4.
- **FR-016** : Le système MUST utiliser un agencement A4 portrait
  (210×297 mm) avec marges extérieures réglables de 5 à 20 mm (défaut 10 mm)
  et espacement inter-stickers réglable de 1 à 10 mm (défaut 3 mm).
- **FR-017** : Le système MUST agencer les stickers de façon à minimiser les
  pertes de surface — résultat visuellement comparable, sur un échantillon
  hétérogène, à un agencement optimisé en deux dimensions (et non à un
  simple alignement par lignes).
- **FR-018** : Tout sticker dont les dimensions ne tiennent pas dans la zone
  imprimable MUST être surligné en rouge dans la liste et exclu de l'export.

#### Visualisation

- **FR-019** : Pour chaque image, le système MUST afficher deux miniatures
  côte à côte : original (« avant ») et détourée + contour (« après »).
- **FR-020** : Tout tap/clic sur une miniature MUST ouvrir un modal plein
  écran zoomable, supportant le pinch-zoom sur mobile.
- **FR-021** : Le système MUST afficher un aperçu A4 grand format avec
  damier de transparence en arrière-plan, stickers placés selon le packing
  courant et cadre en overlay si actif.
- **FR-022** : Tout changement de paramètre (taille, contour, cadre, couleur,
  titre) MUST mettre à jour cet aperçu sans intervention manuelle.

#### Progression

- **FR-023** : Le système MUST exposer en temps réel l'étape courante de
  chaque image (En attente, Décodage, Détourage IA, Génération du contour,
  Mise en page, Terminé), avec libellés en français. L'étape « En attente »
  s'affiche tant que l'image n'a pas encore été prise en charge par un
  worker du pool de détourage.
- **FR-024** : Le système MUST afficher une barre de progression globale
  (X/N images traitées).
- **FR-025** : Un échec sur une image MUST NOT interrompre le traitement des
  autres ; il MUST afficher un message d'erreur en français sur la carte
  concernée.
- **FR-025b** : Le pool de détourage MUST traiter les images selon une file
  FIFO globale partagée entre toutes les sessions/utilisateurs. Quand le
  pool est saturé, les images en attente MUST recevoir périodiquement un
  événement de progression conservant l'étape « En attente », pour garantir
  que l'UI ne reste jamais figée plus de 30 secondes sans signal (cf.
  SC-008). Aucune information sur les autres utilisateurs (position dans la
  file, identité, charge) ne MUST être exposée.

#### Cadres décoratifs

- **FR-026** : Le système MUST proposer une bibliothèque de cadres
  décoratifs sélectionnables visuellement (avec miniatures), incluant un mode
  « Sans cadre ».
- **FR-027** : V1 MUST livrer au minimum sept cadres prédéfinis : quatre à
  bordure partielle (étoiles & confettis, arc-en-ciel, vagues, traces de
  dinos) et trois à bordure complète (stand de fête, guirlande de fanions,
  festons).
- **FR-028** : L'utilisateur MUST pouvoir choisir une couleur principale
  appliquée aux éléments du cadre marqués comme « couleur principale »
  (color picker, format hexadécimal accepté).
- **FR-029** : L'utilisateur MUST pouvoir saisir un titre d'en-tête (champ
  libre, max 60 caractères) qui remplace le placeholder du cadre. Si le
  champ est vide, l'élément d'en-tête est masqué.
- **FR-030** : Le titre saisi MUST adopter la couleur principale choisie.
- **FR-031** : Quand un cadre est actif, l'agencement des stickers MUST se
  restreindre à la zone imprimable définie par le cadre (et non à la zone A4
  brute).
- **FR-032** : Tout changement de cadre, couleur ou titre MUST mettre à jour
  l'aperçu A4 en moins de 100 ms.

#### Extensibilité des cadres (admin)

- **FR-033** : Les cadres MUST être chargés depuis un dossier monté en
  volume contenant des fichiers SVG.
- **FR-034** : Un nouveau fichier SVG ajouté à ce dossier MUST devenir
  disponible dans l'UI sans redémarrage du conteneur, à la prochaine action
  qui rafraîchit la liste de cadres.
- **FR-035** : Tout SVG ne respectant pas le format documenté (viewBox,
  metadata `sticker-area`, parsing XML valide) MUST être ignoré silencieusement
  côté UI, avec un avertissement journalisé côté serveur.
- **FR-036** : Le format de template MUST permettre :
  - de marquer des éléments dont la couleur sera remplacée par la couleur
    principale ;
  - de désigner un élément texte dont le contenu et la couleur sont
    remplacés par le titre saisi ;
  - de déclarer la zone rectangulaire imprimable où les stickers peuvent
    être placés.

#### Export

- **FR-037** : L'utilisateur MUST pouvoir déclencher l'export d'une planche
  A4 dès qu'au moins un sticker est prêt à imprimer.
- **FR-038** : Le système MUST générer un PNG A4 à 300 DPI avec transparence,
  où chaque sticker est composé de l'image détourée superposée à sa
  silhouette blanche élargie.
- **FR-039** : Quand un cadre est actif, le PNG exporté MUST inclure le
  cadre rasterisé en arrière-plan avec la couleur et le titre choisis.
- **FR-040** : Le fichier exporté MUST être nommé selon le format
  `stickut_AAAA-MM-JJ_HHMM.png` (date/heure locale).
- **FR-041** : Le PNG MUST être directement utilisable dans Cricut Design
  Space en mode Print Then Cut, sans manipulation supplémentaire (la
  silhouette blanche fournit le contour de coupe ; aucune marque de
  registration n'est nécessaire).

#### Configuration & paramètres avancés

- **FR-042** : Un panneau « Paramètres avancés » replié par défaut MUST
  exposer : choix du modèle de détourage, toggle alpha matting, marges A4
  extérieures, bouton de purge du cache.
- **FR-043** : Toutes les unités exposées à l'utilisateur (tailles, marges,
  espacements, contour) MUST être en millimètres exclusivement.

#### Plateforme & sécurité

- **FR-044** : Le système MUST être déployable via une seule commande
  `docker compose up`, sans étape manuelle post-démarrage.
- **FR-045** : À l'exécution, le système MUST NOT effectuer d'appel réseau
  sortant, ni de télémétrie, ni d'analytics. Le téléchargement initial des
  modèles peut avoir lieu uniquement au build de l'image.
- **FR-046** : Le système MUST être conçu pour être placé derrière un
  reverse proxy externe assurant l'authentification (pas d'auth intégrée).
- **FR-046b** : La session utilisateur MUST être purement éphémère côté
  client : aucun état (liste d'images, choix de cadre, paramètres) ne MUST
  être persisté en `localStorage`, cookie applicatif ou base. Un
  rafraîchissement de la page MUST réinitialiser l'UI à un état vide ;
  l'utilisateur redépose ses fichiers et bénéficie du cache de cutouts.
- **FR-047** : L'UI MUST être pleinement utilisable sur smartphone (zones de
  touch ≥ 44×44 px, aucune dépendance au survol).
- **FR-048** : Tous les libellés visibles par l'utilisateur MUST être en
  français.

### Key Entities *(include if feature involves data)*

- **Image source** : fichier uploadé par l'utilisateur ; possède un nom, un
  format détecté, une empreinte (hash) et un statut de traitement.
- **Détourage (Cutout)** : résultat du détourage IA ; image RGBA
  transparente, indexée par le couple (hash de l'image source, modèle
  utilisé) ; persisté en cache disque.
- **Sticker** : composition d'un détourage avec un contour blanc d'épaisseur
  donnée ; possède une taille calculée en millimètres et une position dans
  la planche.
- **Planche A4** : dimensions A4, marges, espacement, mode de
  dimensionnement, agencement final des stickers, cadre actif (optionnel),
  couleur de cadre, titre.
- **Cadre (Frame template)** : SVG décrivant un décor, une zone imprimable,
  des éléments customisables (couleur, texte) ; provient soit du jeu fourni
  soit du dossier admin.
- **Session de travail** : ensemble d'images uploadées par un utilisateur
  durant une visite ; éphémère (purgée après inactivité).
- **Tâche de traitement** : pipeline asynchrone qui orchestre le détourage
  de toutes les images d'une session et publie sa progression à l'UI.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** : Un utilisateur novice (n'ayant jamais utilisé Stickut) peut
  produire et télécharger sa première planche A4 en moins de 3 minutes à
  partir de l'upload, sur smartphone, avec 5 photos JPEG (modèle de
  détourage par défaut, sans changer aucun réglage).
- **SC-002** : Pour des images déjà traitées (cache hit), le détourage
  retourne en moins de 200 ms côté utilisateur.
- **SC-003** : Tout changement de paramètre visuel (taille, épaisseur de
  contour, couleur de cadre, titre) est reflété dans l'aperçu en moins de
  100 ms perçus.
- **SC-004** : Sur un parc de 30 photos d'usage typique (smartphone,
  intérieur et extérieur, sujets variés), au moins 90 % donnent un détourage
  jugé satisfaisant à la première inférence avec le modèle par défaut, sans
  intervention.
- **SC-005** : Une planche A4 exportée par Stickut est ouverte dans Cricut
  Design Space, reconnue en mode Print Then Cut, et la machine imprime puis
  découpe correctement les contours sans réglage manuel supplémentaire.
- **SC-006** : Sur un hôte cible (2 vCPU, 4 Go RAM, sans GPU), un lot de
  10 photos JPEG de smartphone moyennes est entièrement traité (détourage
  inclus) en moins de 90 secondes avec le modèle par défaut.
- **SC-007** : Sur le même hôte, le service est joignable et fonctionnel en
  moins de 2 minutes après la première commande `docker compose up` sur une
  machine vierge (modèles inclus dans l'image).
- **SC-008** : Lors d'une session de 20 images, la barre de progression
  reste cohérente (jamais en recul, jamais figée plus de 30 s sans nouvel
  événement).
- **SC-009** : Un échec sur une image n'interrompt jamais le traitement des
  autres (taux de complétion partielle = 100 % des images valides du lot).
- **SC-010** : Un nouveau template SVG conforme déposé dans le dossier
  `templates` apparaît dans l'UI sans redémarrage du conteneur.
- **SC-011** : Un utilisateur tente d'uploader 13 formats variés (les 9
  acceptés + 4 non acceptés) ; les 9 acceptés passent, les 4 non acceptés
  reçoivent un message d'erreur français explicite.
- **SC-012** : Sur les navigateurs mobiles modernes (Android et iOS),
  l'intégralité du flux (upload, ajustements, export) est utilisable au
  doigt sans pinch-zoom involontaire ni élément hors écran.

## Assumptions

- L'utilisateur a accès à une imprimante couleur compatible et à une machine
  Cricut compatible Print Then Cut. Stickut ne pilote pas la machine ; il
  produit le PNG d'entrée pour Cricut Design Space.
- L'authentification et l'exposition HTTPS sont assurées par un reverse
  proxy externe (Nginx Proxy Manager + Authentik dans l'écosystème Xenocloud
  cible). Stickut n'embarque ni comptes ni session persistante.
- Le déploiement cible est un homelab (LXC Proxmox ou Unraid Docker) avec
  2 vCPU minimum, 4 Go RAM, sans GPU obligatoire.
- Le détourage par IA est suffisant pour les usages cibles (photos de
  smartphone, sujets plausibles : enfants, animaux, objets, dessins). Aucune
  garantie n'est donnée sur des images très ambiguës ou très bruitées.
- Les sept cadres prédéfinis V1 sont suffisants pour valider l'expérience
  produit. Toute extension ultérieure passe par le mécanisme « drop-in SVG ».
- L'aperçu et la composition se font côté navigateur en Canvas natif ; les
  performances Canvas modernes des navigateurs cibles sont supposées
  suffisantes pour des planches comportant jusqu'à 50 stickers à 300 DPI.
- L'utilisateur travaille sur une seule planche à la fois (pas de
  multi-pages V1). Si le contenu déborde, il réduit la taille des stickers.
- Stickut ne stocke aucune donnée utilisateur en base ; le seul état
  persistant est le cache de cutouts (anonyme, indexé par hash de contenu)
  et les fichiers temporaires d'upload (purgés après une heure).
- Les variables d'environnement (`STICKUT_*`) constituent l'unique surface
  de configuration de l'admin pour les limites et chemins.
