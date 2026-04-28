import { useStore } from "../store/useStore";

export function ErrorBanner() {
  const error = useStore((s) => s.globalError);
  const setError = useStore((s) => s.setGlobalError);
  if (!error) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 text-rose-900 px-3 py-2 flex items-start justify-between gap-3"
    >
      <p className="text-sm leading-snug">{error}</p>
      <button
        type="button"
        onClick={() => setError(null)}
        className="text-xs uppercase tracking-wide font-semibold text-rose-700 hover:underline"
      >
        Fermer
      </button>
    </div>
  );
}
