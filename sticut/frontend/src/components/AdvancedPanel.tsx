import { useState } from "react";
import { useStore } from "../store/useStore";
import { clearCache } from "../lib/api";
import type { ModelName } from "../types";

const MODELS: { id: ModelName; label: string; hint: string }[] = [
  { id: "birefnet-general", label: "Qualité maximale", hint: "BiRefNet — meilleur rendu, plus lent" },
  { id: "isnet-general-use", label: "Équilibré", hint: "isnet-general-use — bon compromis" },
  { id: "u2net", label: "Rapide", hint: "u2net — léger et rapide" },
  { id: "isnet-anime", label: "Cartoon / dessin", hint: "isnet-anime — pour images stylisées" },
];

export function AdvancedPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setError = useStore((s) => s.setGlobalError);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onClearCache = async () => {
    if (!window.confirm("Vider tout le cache de détourage ?")) return;
    setBusy(true);
    try {
      const res = await clearCache();
      setError(`${res.deleted} fichiers supprimés du cache.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du vidage du cache.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-4 py-3 font-semibold text-slate-800 flex items-center justify-between min-h-touch"
        aria-expanded={open}
      >
        <span>Paramètres avancés</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="grid gap-4 px-4 pb-4">
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-slate-700">Modèle de détourage</legend>
            {MODELS.map((m) => (
              <label key={m.id} className="flex items-start gap-2 min-h-touch">
                <input
                  type="radio"
                  name="model"
                  checked={settings.model === m.id}
                  onChange={() => setSettings({ model: m.id })}
                  className="mt-1.5"
                />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-xs text-slate-500">{m.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <label className="flex items-center gap-2 min-h-touch">
            <input
              type="checkbox"
              checked={settings.alphaMatting}
              onChange={(e) => setSettings({ alphaMatting: e.target.checked })}
            />
            <span>
              <span className="font-medium">Alpha matting</span>
              <span className="block text-xs text-slate-500">
                Améliore les bords cheveux/fourrure (+30 % de temps).
              </span>
            </span>
          </label>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => void onClearCache()}
            disabled={busy}
          >
            {busy ? "Suppression…" : "Vider le cache de détourage"}
          </button>
        </div>
      )}
    </section>
  );
}
