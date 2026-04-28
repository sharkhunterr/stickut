import { useEffect, useRef, useState } from "react";
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

const ACTIVE_STEPS: ReadonlySet<ImageStep> = new Set([
  "En attente",
  "Décodage",
  "Détourage IA",
  "Génération du contour",
  "Mise en page",
]);

// Estimation indicative pour la barre intra-étape (modèle isnet, CPU médian).
const ETA_SECONDS_BY_STEP: Partial<Record<ImageStep, number>> = {
  "En attente": 0,
  Décodage: 1,
  "Détourage IA": 6,
  "Génération du contour": 1,
  "Mise en page": 1,
};

interface Props {
  image: ImageState;
}

export function ImageCard({ image }: Props) {
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [tick, setTick] = useState(0);
  const stepStartRef = useRef<number>(Date.now());
  const lastStepRef = useRef<ImageStep>(image.step);

  useEffect(() => {
    if (lastStepRef.current !== image.step) {
      stepStartRef.current = Date.now();
      lastStepRef.current = image.step;
      setTick(0);
    }
    if (!ACTIVE_STEPS.has(image.step)) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [image.step]);

  const stepClass = STEP_STYLE[image.step] ?? STEP_STYLE["En attente"];
  const isActive = ACTIVE_STEPS.has(image.step);
  const elapsedMs = isActive ? Date.now() - stepStartRef.current : 0;
  const elapsedS = elapsedMs / 1000;
  const eta = ETA_SECONDS_BY_STEP[image.step] ?? 0;
  const etaPct = eta > 0 && isActive ? Math.min(100, Math.round((elapsedS / eta) * 100)) : 0;
  void tick; // re-render tick

  return (
    <div
      className={`rounded-md border bg-white p-1.5 flex flex-col gap-1 ${
        image.unplaced ? "ring-2 ring-rose-500" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-medium truncate" title={image.name}>
          {image.name}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${stepClass}`}
          aria-live="polite"
        >
          {image.step}
          {isActive && elapsedS >= 1 ? ` · ${elapsedS.toFixed(1)} s` : ""}
        </span>
      </div>
      {isActive && eta > 0 && (
        <div className="w-full h-0.5 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-[width] duration-200"
            style={{ width: `${etaPct}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          className="relative aspect-square rounded overflow-hidden border border-slate-200 bg-slate-50"
          onClick={() => setZoom({ src: image.originalBlobUrl, alt: `${image.name} avant` })}
          aria-label={`Voir ${image.name} en grand (avant)`}
        >
          <img
            src={image.originalBlobUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
          />
          <span className="absolute bottom-0 left-0 right-0 text-[9px] uppercase tracking-wide bg-black/40 text-white px-1 py-0.5 text-center">
            avant
          </span>
        </button>

        <button
          type="button"
          className="relative aspect-square rounded overflow-hidden border border-slate-200 checker-bg disabled:opacity-50"
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
            <span className="absolute inset-0 grid place-items-center text-[10px] text-slate-500">
              …
            </span>
          )}
          <span className="absolute bottom-0 left-0 right-0 text-[9px] uppercase tracking-wide bg-black/40 text-white px-1 py-0.5 text-center">
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
