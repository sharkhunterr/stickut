import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";
import { getTemplateUrl, listTemplates } from "../lib/api";

export function FrameSelector() {
  const templates = useStore((s) => s.templates);
  const setTemplates = useStore((s) => s.setTemplates);
  const frame = useStore((s) => s.frame);
  const setFrame = useStore((s) => s.setFrame);
  const setError = useStore((s) => s.setGlobalError);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await listTemplates();
      setTemplates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec du chargement des cadres.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = templates.find((t) => t.id === frame.selectedId) ?? null;
  const supportsHeader = selected?.supports_header ?? false;
  const supportsColor = selected?.supports_color ?? false;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 grid gap-3">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-800">Cadre décoratif</h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-sm text-accent underline"
          aria-expanded={open}
        >
          {open ? "Replier" : "Choisir un cadre"}
        </button>
      </header>

      <div className="text-sm text-slate-600">
        {selected ? (
          <>Sélectionné : <strong>{selected.name}</strong></>
        ) : (
          <>Sélectionné : <strong>Sans cadre</strong></>
        )}
      </div>

      {open && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={() => void refresh()}>
              {loading ? "Actualisation…" : "🔄 Actualiser"}
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto py-1 -mx-1 px-1">
            <FrameThumb
              isSelected={frame.selectedId === null}
              onClick={() => setFrame({ selectedId: null })}
              label="Sans cadre"
              previewUrl={null}
            />
            {templates.map((t) => (
              <FrameThumb
                key={t.id}
                isSelected={frame.selectedId === t.id}
                onClick={() => setFrame({ selectedId: t.id })}
                label={t.name}
                previewUrl={getTemplateUrl(t.id)}
              />
            ))}
          </div>

          {selected && (
            <div className="grid gap-3">
              {supportsColor && (
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">Couleur principale</span>
                  <input
                    type="color"
                    value={frame.color}
                    onChange={(e) => setFrame({ color: e.target.value })}
                    className="min-h-touch min-w-touch w-12 h-10 rounded border border-slate-300 bg-transparent"
                  />
                </label>
              )}
              {supportsHeader && (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Titre d'en-tête</span>
                  <input
                    type="text"
                    maxLength={60}
                    value={frame.headerText}
                    onChange={(e) => setFrame({ headerText: e.target.value })}
                    placeholder="ex : Anniversaire Léa"
                    className="mt-1 w-full min-h-touch rounded-md border border-slate-300 px-3"
                  />
                  <span className="text-xs text-slate-400">
                    {frame.headerText.length} / 60 caractères
                  </span>
                </label>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface ThumbProps {
  isSelected: boolean;
  onClick: () => void;
  label: string;
  previewUrl: string | null;
}

function FrameThumb({ isSelected, onClick, label, previewUrl }: ThumbProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 grid place-items-center w-24 h-32 rounded-md border-2 px-1 text-xs ${
        isSelected ? "border-accent bg-blue-50" : "border-slate-200 bg-white"
      }`}
      aria-pressed={isSelected}
      title={label}
    >
      <div className="w-full h-20 grid place-items-center bg-slate-50 rounded overflow-hidden">
        {previewUrl ? (
          <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-slate-400">∅</span>
        )}
      </div>
      <span className="mt-1 truncate w-full text-center">{label}</span>
    </button>
  );
}
