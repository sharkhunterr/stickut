# Stickut

Générateur auto-hébergé de planches A4 de stickers prêtes à imprimer puis
découper avec une Cricut (Print Then Cut). Dépose des images, Stickut les
détoure automatiquement, leur applique un contour blanc arrondi, les
agence sur une feuille A4 et te rend un PNG 300 DPI compatible Cricut
Design Space.

## Quickstart

```bash
git clone <repo> stickut && cd stickut
cp .env.example .env
docker compose up --build
```

Puis ouvre `http://localhost:8000`.

Pour la procédure complète de validation (V1 acceptance), voir
[`specs/001-v1-stickers-pipeline/quickstart.md`](specs/001-v1-stickers-pipeline/quickstart.md).
La constitution du projet vit dans
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).
