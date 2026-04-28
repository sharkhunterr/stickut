import { useEffect, useState } from "react";
import {
  getRuntimeConfig,
  setRuntimeConfig,
  type RuntimeConfigResponse,
} from "../lib/api";
import { useStore } from "../store/useStore";

/** Section "Recherche en ligne" du panneau Paramètres app.
 *  Aligné stylistiquement avec AdvancedPanel : fieldsets, toggle switch,
 *  pas de blabla sur les variables d'env. */
export function SearchConfigPanel() {
  const bumpConfigVersion = useStore((s) => s.bumpConfigVersion);
  const [cfg, setCfg] = useState<RuntimeConfigResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    getRuntimeConfig()
      .then((c) => {
        setCfg(c);
        setEnabled(c.enable_search);
      })
      .catch((err) => {
        setFeedback({
          kind: "err",
          msg: err instanceof Error ? err.message : "Échec du chargement.",
        });
      });
  }, []);

  if (!cfg) return null;

  const enableLocked = cfg.env_locked.enable_search;
  const keyLocked = cfg.env_locked.pixabay_api_key;

  const persist = async (patch: { enable_search?: boolean; pixabay_api_key?: string }) => {
    setBusy(true);
    setFeedback(null);
    try {
      const next = await setRuntimeConfig(patch);
      setCfg(next);
      bumpConfigVersion();
      return next;
    } catch (err) {
      setFeedback({
        kind: "err",
        msg: err instanceof Error ? err.message : "Échec.",
      });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onToggle = async () => {
    if (enableLocked || busy) return;
    const next = !enabled;
    setEnabled(next);
    await persist({ enable_search: next });
  };

  const onSaveKey = async () => {
    if (keyLocked || keyInput.trim().length === 0) return;
    const next = await persist({ pixabay_api_key: keyInput.trim() });
    if (next) {
      setKeyInput("");
      setFeedback({ kind: "ok", msg: `Clé enregistrée. Provider : ${next.search_provider}.` });
    }
  };

  const onClearKey = async () => {
    if (keyLocked || !cfg.pixabay_api_key_set) return;
    if (!window.confirm("Retirer la clé Pixabay ? Bascule sur Openverse.")) return;
    const next = await persist({ pixabay_api_key: "" });
    if (next) {
      setKeyInput("");
      setFeedback({ kind: "ok", msg: `Provider : ${next.search_provider}.` });
    }
  };

  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium text-slate-700">Recherche d'images en ligne</legend>

      <label className="flex items-center justify-between gap-2 min-h-touch">
        <span>
          <span className="font-medium">Activer la recherche</span>
          <span className="block text-xs text-slate-500">
            Provider : <span className="font-mono">{cfg.search_provider ?? "désactivé"}</span>
          </span>
        </span>
        <ToggleSwitch checked={enabled} disabled={enableLocked || busy} onChange={onToggle} />
      </label>

      <div className="grid gap-1">
        <label className="text-sm font-medium text-slate-700" htmlFor="pixabay-key">
          Clé API Pixabay
          {cfg.pixabay_api_key_set && (
            <span className="ml-2 text-xs font-normal text-emerald-700">enregistrée</span>
          )}
        </label>
        <div className="flex gap-2">
          <input
            id="pixabay-key"
            type={showKey ? "text" : "password"}
            value={keyInput}
            disabled={keyLocked || busy}
            placeholder={cfg.pixabay_api_key_set ? "••••••••••••" : "Coller la clé…"}
            onChange={(e) => setKeyInput(e.target.value)}
            className="flex-1 min-h-touch px-3 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-slate-50"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn-secondary px-3"
            onClick={() => setShowKey((s) => !s)}
            disabled={keyInput.length === 0}
            aria-label={showKey ? "Masquer la clé" : "Afficher la clé"}
          >
            {showKey ? "🙈" : "👁"}
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={() => void onSaveKey()}
            disabled={busy || keyLocked || keyInput.trim().length === 0}
          >
            Enregistrer la clé
          </button>
          {cfg.pixabay_api_key_set && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void onClearKey()}
              disabled={busy || keyLocked}
            >
              Retirer
            </button>
          )}
        </div>
      </div>

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
    </fieldset>
  );
}

function ToggleSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-accent" : "bg-slate-300"
      }`}
    >
      <span
        aria-hidden
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
