# Stickut

Générateur auto-hébergé de planches A4 de stickers prêtes à imprimer puis
découper avec une Cricut (Print Then Cut). Dépose des images, Stickut les
détoure automatiquement, leur applique un contour blanc arrondi, les
agence sur une feuille A4 et te rend un PNG 300 DPI compatible Cricut
Design Space.

## Quickstart — Docker (production)

```bash
git clone <repo> stickut && cd stickut
cp .env.example .env
docker compose up --build
```

Puis ouvre `http://localhost:8000`.

## Quickstart — dev local (sans Docker)

```bash
scripts/install.sh                    # installe backend (venv) + frontend (npm)
scripts/install.sh --with-models      # idem + pré-télécharge les ~700 Mo de modèles ONNX
scripts/dev.sh                        # lance uvicorn + vite (Ctrl-C pour arrêter)
```

Puis ouvre <http://127.0.0.1:5173/>. L'API est servie par uvicorn sur
<http://127.0.0.1:8000/api/docs> (Vite proxifie `/api`).

Pour la procédure complète de validation (V1 acceptance), voir
[`specs/001-v1-stickers-pipeline/quickstart.md`](specs/001-v1-stickers-pipeline/quickstart.md).
La constitution du projet vit dans
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).
