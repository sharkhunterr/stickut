import { useState } from "react";
import type { ImageState } from "../store/useStore";
import type { ImageStep } from "../types";
import { ZoomModal } from "./ZoomModal";

const STEP_STYLE: Record<ImageStep, string> = {
  "En attente": "bg-slate-200 text-slate-700",
  Décodage: "bg-blue-100 text-blue-800",
  "Détourage IA": "bg-blue-200 text-blue-900",
  "Génération du contour": "bg-indigo-100 text-indigo-800",
  "Mise en page": "bg-indigo-200 text-indigo-900",
  Terminé: "bg-emerald-200 text-emerald-900",
  Échec: "bg-rose-200 text-rose-900",
};

interface Props {
  image: ImageState;
}

export function ImageCard({ image }: Props) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);

  const stepClass = STEP_STYLE[image.step] ?? STEP_STYLE["En attente"];

  return (
    <div
      className={`rounded-lg border bg-white p-3 flex flex-col gap-2 ${
        image.unplaced ? "ring-2 ring-rose-500" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate" title={image.name}>
          {image.name}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${stepClass}`}
          aria-live="polite"
        >
          {image.step}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="relative aspect-square min-h-touch rounded-md overflow-hidden border border-slate-200 bg-slate-50"
          onClick={() => setZoom({ src: image.originalBlobUrl, alt: `${image.name} avant` })}
          aria-label={`Voir ${image.name} en grand (avant)`}
        >
          <img
            src={image.originalBlobUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />
          <span className="absolute bottom-0 left-0 right-0 text-[10px] uppercase tracking-wide bg-black/40 text-white px-1 py-0.5 text-center">
            avant
          </span>
        </button>

        <button
          type="button"
          className="relative aspect-square min-h-touch rounded-md overflow-hidden border border-slate-200 checker-bg disabled:opacity-50"
          disabled={!image.borderedBlobUrl}
          onClick={() =>
            image.borderedBlobUrl &&
            setZoom({ src: image.borderedBlobUrl, alt: `${image.name} après` })
          }
          aria-label={`Voir ${image.name} en grand (après)`}
        >
          {image.borderedBlobUrl ? (
            <img
              src={image.borderedBlobUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-xs text-slate-500">
              en cours…
            </span>
          )}
          <span className="absolute bottom-0 left-0 right-0 text-[10px] uppercase tracking-wide bg-black/40 text-white px-1 py-0.5 text-center">
            après
          </span>
        </button>
      </div>

      {image.error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          {image.error}
        </p>
      )}
      {image.unplaced && !image.error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          Trop grand pour cette planche — réduisez la taille pour l'inclure.
        </p>
      )}

      {zoom && <ZoomModal src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </div>
  );
}
