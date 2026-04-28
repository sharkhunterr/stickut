import { useState } from "react";
import { useStore } from "../store/useStore";
import { clearCache } from "../lib/api";
import type { ModelName } from "../types";

const MODELS: { id: ModelName; label: string; hint: string }[] = [
  { id: "isnet-general-use", label: "Équilibré (recommandé)", hint: "isnet-general-use — bon compromis vitesse/qualité" },
  { id: "u2net", label: "Rapide", hint: "u2net — léger et rapide" },
  { id: "birefnet-general", label: "Qualité maximale (lent)", hint: "BiRefNet — meilleur rendu, ~10× plus lent" },
  { id: "isnet-anime", label: "Cartoon / dessin", hint: "isnet-anime — pour images stylisées" },
];

export function AdvancedPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const resetImageCutouts = useStore((s) => s.resetImageCutouts);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const onClearCache = async () => {
    if (!window.confirm("Vider tout le cache de détourage ?\n\nLes images seront re-détourées au prochain traitement.")) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await clearCache();
      // Reset l'état frontend des images aussi → le prochain "Lancer le traitement"
      // les re-détourera (sinon les blob URLs côté client masquent que le cache serveur est vide).
      resetImageCutouts();
      setFeedback({
        kind: "ok",
        msg: `${res.deleted} fichier(s) supprimé(s). Relance le traitement pour appliquer.`,
      });
    } catch (err) {
      setFeedback({
        kind: "err",
        msg: err instanceof Error ? err.message : "Échec du vidage du cache.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
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
      {feedback && (
        <p
          className={`text-xs px-2 py-1.5 rounded border ${
            feedback.kind === "ok"
              ? "text-emerald-800 bg-emerald-50 border-emerald-200"
              : "text-rose-800 bg-rose-50 border-rose-200"
          }`}
        >
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
