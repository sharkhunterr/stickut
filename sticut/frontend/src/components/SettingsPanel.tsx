import { useStore } from "../store/useStore";

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 grid gap-4">
      <header>
        <h2 className="font-semibold text-slate-800">Réglages</h2>
      </header>

      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">Mode taille fixe</span>
          <button
            type="button"
            className={`w-full min-h-touch rounded-md border px-3 ${
              settings.sizeMode === "fixed"
                ? "bg-accent text-white border-accent"
                : "bg-white border-slate-300"
            }`}
            onClick={() => setSettings({ sizeMode: "fixed" })}
            aria-pressed={settings.sizeMode === "fixed"}
          >
            Taille fixe
          </button>
        </label>
        <label className="flex-1">
          <span className="sr-only">Mode taille variable</span>
          <button
            type="button"
            className={`w-full min-h-touch rounded-md border px-3 ${
              settings.sizeMode === "range"
                ? "bg-accent text-white border-accent"
                : "bg-white border-slate-300"
            }`}
            onClick={() => setSettings({ sizeMode: "range" })}
            aria-pressed={settings.sizeMode === "range"}
          >
            Plage de tailles
          </button>
        </label>
      </div>

      {settings.sizeMode === "fixed" ? (
        <Slider
          label="Taille des stickers"
          unit="mm"
          min={15}
          max={120}
          step={1}
          value={settings.sizeFixedMm}
          onChange={(v) => setSettings({ sizeFixedMm: v })}
        />
      ) : (
        <>
          <Slider
            label="Taille minimale"
            unit="mm"
            min={15}
            max={120}
            step={1}
            value={settings.sizeMinMm}
            onChange={(v) => setSettings({ sizeMinMm: Math.min(v, settings.sizeMaxMm - 1) })}
          />
          <Slider
            label="Taille maximale"
            unit="mm"
            min={15}
            max={120}
            step={1}
            value={settings.sizeMaxMm}
            onChange={(v) => setSettings({ sizeMaxMm: Math.max(v, settings.sizeMinMm + 1) })}
          />
        </>
      )}

      <Slider
        label="Épaisseur du contour blanc"
        unit="mm"
        min={0.5}
        max={8}
        step={0.1}
        value={settings.borderThicknessMm}
        onChange={(v) => setSettings({ borderThicknessMm: Math.round(v * 10) / 10 })}
      />

      <Slider
        label="Espacement entre stickers"
        unit="mm"
        min={1}
        max={10}
        step={0.5}
        value={settings.spacingMm}
        onChange={(v) => setSettings({ spacingMm: Math.round(v * 2) / 2 })}
      />

      <Slider
        label="Marge extérieure A4"
        unit="mm"
        min={5}
        max={20}
        step={1}
        value={settings.outerMarginMm}
        onChange={(v) => setSettings({ outerMarginMm: v })}
      />
    </section>
  );
}

interface SliderProps {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}

function Slider({ label, unit, min, max, step, value, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="flex justify-between text-sm font-medium text-slate-700">
        <span>{label}</span>
        <span>
          {value.toLocaleString("fr-FR")} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-h-touch accent-accent"
      />
    </label>
  );
}
