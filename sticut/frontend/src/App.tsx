import { useEffect, useMemo, useRef, useState } from "react";
import { ErrorBanner } from "./components/ErrorBanner";
import { ExportButton } from "./components/ExportButton";
import { FrameSelector } from "./components/FrameSelector";
import { ImageGrid } from "./components/ImageGrid";
import { ProgressBar } from "./components/ProgressBar";
import { SettingsPanel } from "./components/SettingsPanel";
import { AdvancedPanel } from "./components/AdvancedPanel";
import { UploadZone } from "./components/UploadZone";
import { A4Preview } from "./components/A4Preview";
import { applyWhiteBorderToBlob } from "./lib/canvas/border";
import { startProcess, uploadImages } from "./lib/api";
import { subscribeProcess } from "./lib/sse";
import { useStore, type ImageState } from "./store/useStore";
import type { ImageStep } from "./types";

export default function App() {
  const sessionId = useStore((s) => s.sessionId);
  const setSessionId = useStore((s) => s.setSessionId);
  const setTaskId = useStore((s) => s.setTaskId);
  const images = useStore((s) => s.images);
  const settings = useStore((s) => s.settings);
  const addImages = useStore((s) => s.addImages);
  const patchImage = useStore((s) => s.patchImage);
  const setError = useStore((s) => s.setGlobalError);

  const [running, setRunning] = useState(false);
  const subRef = useRef<{ close: () => void } | null>(null);

  // Re-render border whenever the user changes thickness AND the cutout is available.
  // This is what makes the slider feel instant (constitution IV).
  const borderVersion = useRef(0);
  useEffect(() => {
    borderVersion.current += 1;
    const v = borderVersion.current;
    void rebuildBorders(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.borderThicknessMm]);

  async function rebuildBorders(version: number) {
    for (const img of images) {
      if (!img.cutoutBlobUrl) continue;
      try {
        const resp = await fetch(img.cutoutBlobUrl);
        const blob = await resp.blob();
        if (version !== borderVersion.current) return; // user moved the slider again
        const { blob: bordered, widthPx, heightPx } = await applyWhiteBorderToBlob(
          blob,
          settings.borderThicknessMm,
          300,
        );
        if (version !== borderVersion.current) return;
        const url = URL.createObjectURL(bordered);
        patchImage(img.id, { borderedBlobUrl: url, cutoutWidthPx: widthPx, cutoutHeightPx: heightPx });
      } catch (err) {
        console.warn("border rebuild failed", err);
      }
    }
  }

  const onFiles = async (files: File[]) => {
    try {
      const resp = await uploadImages(files, sessionId ?? undefined);
      setSessionId(resp.session_id);
      const next: ImageState[] = resp.images.map((u, idx) => ({
        id: u.id,
        name: u.name,
        hash: u.hash,
        originalBlobUrl: URL.createObjectURL(files[idx]),
        cutoutBlobUrl: u.cutout_url ?? null,
        borderedBlobUrl: null,
        cutoutWidthPx: 0,
        cutoutHeightPx: 0,
        step: u.cutout_url ? "Génération du contour" : "En attente",
        error: null,
        unplaced: false,
      }));
      addImages(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'upload.");
    }
  };

  const onProcess = async () => {
    if (!sessionId) return;
    if (subRef.current) subRef.current.close();
    setRunning(true);
    try {
      const resp = await startProcess({
        session_id: sessionId,
        model: settings.model,
        alpha_matting: settings.alphaMatting,
      });
      setTaskId(resp.task_id);
      subRef.current = subscribeProcess(resp.task_id, {
        onStarted: (e) => updateStep(e.image_id, e.step),
        onProgress: (e) => updateStep(e.image_id, e.step),
        onDone: async (e) => {
          patchImage(e.image_id, { cutoutBlobUrl: e.cutout_url, step: "Génération du contour" });
          await runBorderForOne(e.image_id, e.cutout_url);
        },
        onFailed: (e) => patchImage(e.image_id, { step: "Échec", error: e.error }),
        onComplete: () => setRunning(false),
        onError: () => {
          // EventSource auto-reconnects in many browsers; we only surface an error if no events ever flowed.
        },
      });
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "Échec du lancement du traitement.");
    }
  };

  const updateStep = (id: string, step: ImageStep) => {
    patchImage(id, { step });
  };

  const runBorderForOne = async (id: string, cutoutUrl: string) => {
    try {
      const resp = await fetch(cutoutUrl);
      const blob = await resp.blob();
      const { blob: bordered, widthPx, heightPx } = await applyWhiteBorderToBlob(
        blob,
        settings.borderThicknessMm,
        300,
      );
      const url = URL.createObjectURL(bordered);
      patchImage(id, {
        borderedBlobUrl: url,
        cutoutWidthPx: widthPx,
        cutoutHeightPx: heightPx,
        step: "Mise en page",
      });
      // Switch to "Terminé" on the next tick so the user sees the transition.
      setTimeout(() => patchImage(id, { step: "Terminé" }), 50);
    } catch (err) {
      patchImage(id, {
        step: "Échec",
        error: err instanceof Error ? err.message : "Génération du contour échouée.",
      });
    }
  };

  // Hydrate cutouts on first load when /api/upload reported a cache hit.
  useEffect(() => {
    void (async () => {
      for (const img of images) {
        if (img.cutoutBlobUrl && !img.borderedBlobUrl) {
          await runBorderForOne(img.id, img.cutoutBlobUrl);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const total = images.length;
    const done = images.filter((i) => i.step === "Terminé" || i.step === "Échec").length;
    return { total, done };
  }, [images]);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <h1 className="text-xl font-bold tracking-tight">Stickut</h1>
          <span className="text-xs text-slate-500">planches A4 pour Cricut Print Then Cut</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 grid gap-4">
        <ErrorBanner />

        <UploadZone onFiles={onFiles} disabled={running} />

        {images.length > 0 && (
          <>
            <div className="grid lg:grid-cols-[2fr_3fr] gap-4">
              <div className="grid gap-3">
                <ProgressBar done={stats.done} total={stats.total} />
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void onProcess()}
                  disabled={running || images.length === 0}
                >
                  {running ? "Traitement en cours…" : "Lancer le traitement"}
                </button>
                <ExportButton />
                <SettingsPanel />
                <FrameSelector />
                <AdvancedPanel />
              </div>
              <div className="grid gap-3">
                <A4Preview />
                <ImageGrid />
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-slate-500">
        <p>
          Stickut V1 — auto-hébergé, sans télémétrie. Voir{" "}
          <a className="underline" href="/api/docs">
            /api/docs
          </a>{" "}
          pour l'API.
        </p>
      </footer>
    </div>
  );
}
