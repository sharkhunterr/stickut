<!--
SYNC IMPACT REPORT
==================
Version change: TEMPLATE (unfilled placeholders) → 1.0.0
Bump rationale: Initial ratification — first concrete constitution replacing
the unpopulated template. MAJOR establishes the baseline document.

Modified principles:
  (none — initial ratification)

Added sections:
  - Identité
  - Principes fondateurs (10 principles, declarative MUST/SHOULD form)
  - Stack technique (constraints)
  - Conventions (development workflow)
  - Non-objectifs V1 (explicit scope exclusions)
  - Cible de déploiement
  - Governance

Removed sections:
  (none — template placeholders all populated)

Templates requiring updates:
  - .specify/templates/plan-template.md ✅ no change required
    (Constitution Check is a runtime placeholder filled by /speckit-plan;
     gates will be derived from this file at plan time)
  - .specify/templates/spec-template.md ✅ no change required
    (no new mandatory sections introduced by this constitution)
  - .specify/templates/tasks-template.md ✅ no change required
    (task categorization compatible — no new principle-driven categories)
  - .specify/templates/checklist-template.md ✅ no change required
  - .specify/templates/agent-file-template.md ✅ no change required

Follow-up TODOs:
  (none)
-->

# Stickut Constitution

## Identité

**Stickut** est une application web auto-hébergée qui transforme des images
quelconques en planches de stickers prêtes à imprimer puis découper avec une
Cricut (Print Then Cut). L'utilisateur dépose des images, Stickut les détoure
automatiquement, leur applique un contour blanc arrondi de qualité
professionnelle, et les agence sur une feuille A4 avec un cadre décoratif
optionnel.

Le projet vit dans l'écosystème Xenocloud aux côtés des autres services *arr du
foyer, derrière un reverse proxy et un SSO existants (Nginx Proxy Manager +
Authentik).

## Core Principles

### I. Une seule action utilisateur

Le parcours utilisateur MUST être exactement : upload → planche A4. Aucun
éditeur per-sticker, aucune manipulation manuelle d'image, aucun recadrage,
aucun drag & drop de repositionnement. Les seuls réglages exposés sont
globaux (taille des stickers, épaisseur de contour, choix du cadre, layout).

**Rationale** : la valeur de Stickut est l'automatisation. Tout réglage par
sticker recrée la complexité d'un éditeur graphique et trahit le produit.

### II. Qualité de détourage non négociable

Le détourage MUST utiliser `rembg` (modèles ONNX) côté serveur. Les heuristiques
de type flood-fill, alpha-edge, chroma key, ou détection de bord par seuillage
sont INTERDITES comme méthode principale de détourage.

**Rationale** : un détourage médiocre rend le produit final inutilisable.
La qualité du sticker dépend directement de la qualité de l'alpha. Aucun
compromis sur ce point.

### III. CPU-first

Tous les chemins d'inférence MUST fonctionner sur CPU seul. Le GPU MAY être
exploité s'il est détecté, mais NEVER ne MUST être une condition de
déploiement. Aucune dépendance CUDA ne MUST entrer dans l'image runtime par
défaut.

**Rationale** : la cible de déploiement est un LXC Proxmox ou un conteneur
Unraid sans GPU. Exiger un GPU exclurait la quasi-totalité des hôtes ciblés.

### IV. Réactivité maximale (cache + canvas)

Le détourage côté serveur MUST être effectué exactement une fois par image et
mis en cache persistant indexé par hash du contenu. Toute la composition
(épaisseur du contour, taille des stickers, layout, cadre) MUST se faire
côté client en Canvas natif, sans aller-retour serveur après l'étape de
détourage.

**Rationale** : `rembg` sur CPU est lent (plusieurs secondes par image).
Recalculer côté client maintient une UI temps réel pendant que les ajustements
visuels restent interactifs.

### V. Multi-formats généreux

Le serveur MUST accepter en upload : JPEG, PNG, WebP, GIF, BMP, TIFF,
HEIC/HEIF, AVIF. La conversion vers le format interne MUST être transparente
pour l'utilisateur. Aucun message d'erreur lié au format d'entrée ne MUST être
exposé à l'utilisateur tant qu'un de ces formats est utilisé.

**Rationale** : les utilisateurs déposent ce qu'ils ont sous la main, souvent
depuis un téléphone (HEIC iOS, AVIF moderne). Refuser un format casse le flux.

### VI. Mobile-first responsive

L'UI MUST être conçue mobile d'abord. Aucune interaction primaire ne MUST
dépendre du `:hover`. Les zones de touch MUST mesurer au moins 44×44 px.
La version desktop MUST être un élargissement de la version mobile, jamais
une UI distincte.

**Rationale** : les images proviennent majoritairement de téléphones, et
l'utilisateur déclenche le traitement depuis son téléphone. Le desktop est
secondaire.

### VII. Feedback constant

Chaque image en cours de traitement MUST exposer une progression en temps réel
via Server-Sent Events, avec des noms d'étapes en français (par exemple :
« Conversion », « Détourage », « Ajout du contour », « Mise en page »). Une
prévisualisation avant/après MUST être systématiquement affichée avant
téléchargement final.

**Rationale** : un traitement de plusieurs secondes sans retour visuel donne
l'impression d'une appli figée. La progression nommée rassure et indique où
investiguer en cas de lenteur.

### VIII. Cadres décoratifs extensibles

Les cadres décoratifs MUST être chargés depuis un dossier monté en volume
(`./templates`) au format SVG. Ajouter un cadre MUST nécessiter uniquement le
dépôt d'un fichier — pas de modification de code, pas de rebuild d'image, pas
de redémarrage du conteneur (rechargement à chaud ou à la requête).

**Rationale** : les cadres sont une composante esthétique personnelle. La barre
d'entrée pour en ajouter doit être nulle.

### IX. Self-hosted, zéro cloud

À l'exécution, l'application MUST NOT effectuer d'appel réseau sortant en
dehors de l'hôte. Exception unique : téléchargement initial des modèles ONNX
au build de l'image Docker. Pas de télémétrie. Pas d'analytics. Pas de service
de compte. Pas d'authentification intégrée — déléguée au reverse proxy.

**Rationale** : Stickut traite des images personnelles. Aucune justification
business ne légitime un appel externe à l'exécution.

### X. Docker-natif

Le projet MUST livrer un `docker-compose.yml` unique qui démarre la stack
complète avec `docker compose up`. Aucune étape manuelle (installation Python,
build npm, téléchargement de modèle) ne MUST être requise après ce seul
commande.

**Rationale** : la cible utilisateur est un homelab. La friction de
déploiement doit être nulle.

## Stack technique (contraintes)

### Backend

- **Langage** : Python 3.12 (MUST)
- **Serveur** : FastAPI + uvicorn ASGI
- **Détourage** : `rembg[cpu]` avec choix entre plusieurs modèles ONNX
- **Images** : Pillow + pillow-heif + pillow-avif-plugin
- **Templates SVG** : lxml
- **Cache** : diskcache (persistant, indexé par hash de contenu)
- **Validation** : Pydantic v2

### Frontend

- **Framework** : React 18 + Vite + TypeScript (strict, `any` interdit)
- **CSS** : TailwindCSS (utility-first, mobile-first)
- **State global** : Zustand
- **Graphique** : Canvas API native — pas de lib graphique tierce
- **Streaming progression** : Server-Sent Events

### Conteneurisation

- Dockerfile multi-stage (build Vite → runtime Python servant le SPA buildé)
- `docker-compose.yml` unique
- Volumes obligatoires : `./templates`, `./cache`, `./tmp`

## Conventions

- **Langue UI** : 100% français.
- **Langue code, commits, identifiants, commentaires de code** : anglais.
- **Unités exposées à l'utilisateur** : millimètres exclusivement. Les pixels
  sont un détail d'implémentation et MUST NOT apparaître dans l'UI.
- **Naming interne** : le suffixe `ut` (du nom Stickut) MUST NOT apparaître
  dans les variables, fonctions, ou noms de fichiers internes — il est
  réservé au nom du projet.
- **Style Python** : `ruff` + `black`, type hints sur toute fonction publique,
  modèles Pydantic v2 pour toute structure API.
- **Style TypeScript** : `eslint` + `prettier`, `strict: true`, `any` proscrit.
- **API REST** : verbes HTTP standards, JSON par défaut, endpoints binaires
  signalés explicitement par leur `Content-Type`.
- **Erreurs API** : MUST toujours retourner `{"detail": "message en français"}`
  pour affichage direct par l'UI sans retraitement.

## Non-objectifs V1 (volontairement exclus)

Les éléments suivants MUST NOT être implémentés en V1 sans amendement formel
de la constitution :

- Éditeur per-sticker (rotation manuelle, recadrage, drag & drop).
- Modifications stylistiques de l'image (filtres anime, holographique,
  paillettes, dropshadow).
- Authentification intégrée — déléguée au reverse proxy externe (Authentik).
- Comptes utilisateurs, projets sauvegardés en base.
- Export PDF (PNG 300 DPI uniquement, format adapté à Cricut Design Space).
- Multi-pages A4 (l'overflow reste visible, l'utilisateur réduit la taille).
- Marketplace ou bibliothèque en ligne de cadres (ajout manuel par fichier
  exclusivement).

## Cible de déploiement

- **Plateforme** : Proxmox LXC ou Docker host (Unraid).
- **CPU** : 2 vCPU minimum recommandés (rembg est CPU-bound).
- **RAM** : 2 GB minimum, 4 GB confortable avec le modèle birefnet.
- **Disque** : ~500 MB image + variable pour le cache (~2 MB par image
  traitée).
- **Réseau** : derrière Nginx Proxy Manager existant + Authentik.
- **Port interne** : 8000 par défaut, configurable via variable
  d'environnement.

## Governance

Cette constitution prévaut sur toute autre pratique, convention de code, ou
décision de design dans ce dépôt. En cas de conflit entre cette constitution
et un document, un README, ou un commentaire de code, la constitution gagne
et le document conflictuel MUST être corrigé.

**Procédure d'amendement** :

1. Toute modification de cette constitution MUST passer par `/speckit-constitution`.
2. Le numéro de version MUST être incrémenté selon le semver suivant :
   - **MAJOR** : suppression ou redéfinition incompatible d'un principe ou
     d'une règle de gouvernance.
   - **MINOR** : ajout d'un principe, d'une section, ou extension matérielle
     d'une règle existante.
   - **PATCH** : clarification, reformulation, correction de typo, sans
     changement sémantique.
3. La date `Last Amended` MUST être mise à jour à chaque amendement.
4. Un Sync Impact Report MUST être préfixé en commentaire HTML au sommet du
   fichier après amendement.

**Revue de conformité** :

- Toute PR MUST être lisible à la lumière de cette constitution. Une violation
  identifiée MUST être justifiée explicitement dans la PR ou refusée.
- Les commandes `/speckit-plan`, `/speckit-tasks` et `/speckit-analyze`
  utilisent ce fichier comme source de vérité pour leurs gates.
- La complexité ajoutée MUST être justifiée par référence aux principes — la
  simplicité par défaut.

**Version**: 1.0.0 | **Ratified**: 2026-04-27 | **Last Amended**: 2026-04-27
