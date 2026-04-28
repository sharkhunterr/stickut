import { useEffect, useState } from "react";
import { useStore, type ImageState } from "../store/useStore";
import {
  getRuntimeConfig,
  importFromUrl,
  searchImages,
  type ImageType,
  type SearchHit,
  type SearchProvider,
} from "../lib/api";

interface ProviderTabState {
  hits: SearchHit[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
}

const PROVIDER_LABELS: Record<SearchProvider, string> = {
  pixabay: "Pixabay",
  iconify: "Iconify",
  wikimedia: "Wikimedia",
  openverse: "Openverse",
};

const PROVIDER_HINTS: Record<SearchProvider, string> = {
  pixabay: "photos / illustrations / vecteurs (clé requise)",
  iconify: "200k icônes SVG (Phosphor, Tabler, Game-Icons…)",
  wikimedia: "100M illustrations + SVG, licences CC variables",
  openverse: "600M items CC, surtout photos",
};

const IMAGE_TYPES: { id: ImageType; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "illustration", label: "Illustrations" },
  { id: "vector", label: "Vecteurs" },
  { id: "photo", label: "Photos" },
];

const EMPTY_TAB: ProviderTabState = {
  hits: [],
  page: 0,
  hasMore: false,
  loading: false,
  error: null,
};

/** Recherche d'images en ligne — UI à onglets par provider.
 *  Chaque onglet conserve ses résultats en cache pour cette query → switch
 *  entre onglets sans relancer une requête. Nouvelle query → cache vidé. */
export function SearchPanel() {
  const sessionId = useStore((s) => s.sessionId);
  const setSessionId = useStore((s) => s.setSessionId);
  const addImages = useStore((s) => s.addImages);
  const setError = useStore((s) => s.setGlobalError);
  const configVersion = useStore((s) => s.configVersion);
  const processing = useStore((s) => s.processing);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [providers, setProviders] = useState<SearchProvider[]>([]);
  const [activeProvider, setActiveProvider] = useState<SearchProvider | null>(null);
  const [imageType, setImageType] = useState<ImageType>("illustration");

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState(""); // dernière query effectivement lancée
  const [tabs, setTabs] = useState<Map<SearchProvider, ProviderTabState>>(new Map());
  const [importingId, setImportingId] = useState<string | null>(null);

  // Charge l'état de config + providers dispos.
  useEffect(() => {
    let cancelled = false;
    getRuntimeConfig()
      .then((c) => {
        if (cancelled) return;
        setEnabled(c.enable_search);
        setProviders(c.available_providers);
        setActiveProvider((curr) => curr ?? c.available_providers[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configVersion]);

  // Auto-collapse pendant un traitement.
  useEffect(() => {
    if (processing && open) setOpen(false);
  }, [processing, open]);

  if (enabled === null) return null;
  if (!enabled) return null;
  if (providers.length === 0) return null;

  const tab = (activeProvider && tabs.get(activeProvider)) ?? EMPTY_TAB;
  const showImageTypeFilter = activeProvider === "pixabay";

  /** Lance une recherche pour un provider donné (page 1 ou append). */
  const fetchProvider = async (
    provider: SearchProvider,
    queryStr: string,
    targetPage: number,
    append: boolean,
  ) => {
    setTabs((prev) => {
      const m = new Map(prev);
      const cur = m.get(provider) ?? EMPTY_TAB;
      m.set(provider, { ...cur, loading: true, error: null });
      return m;
    });
    try {
      const res = await searchImages(queryStr, targetPage, {
        provider,
        imageType: provider === "pixabay" ? imageType : "all",
      });
      setTabs((prev) => {
        const m = new Map(prev);
        const cur = m.get(provider) ?? EMPTY_TAB;
        const newHits = append ? [...cur.hits, ...res.hits] : res.hits;
        m.set(provider, {
          hits: newHits,
          page: targetPage,
          hasMore:
            res.hits.length >= res.per_page && targetPage * res.per_page < res.total,
          loading: false,
          error: null,
        });
        return m;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Recherche échouée.";
      setTabs((prev) => {
        const m = new Map(prev);
        const cur = m.get(provider) ?? EMPTY_TAB;
        m.set(provider, { ...cur, loading: false, error: msg });
        return m;
      });
    }
  };

  const onSubmit = async () => {
    const term = q.trim();
    if (!term || !activeProvider) return;
    // Nouvelle query → reset du cache de tous les tabs.
    setSubmittedQ(term);
    setTabs(new Map());
    await fetchProvider(activeProvider, term, 1, false);
  };

  /** Switch d'onglet : si pas encore chargé pour cette query, lance la recherche. */
  const onTabChange = async (provider: SearchProvider) => {
    setActiveProvider(provider);
    if (!submittedQ) return;
    if (!tabs.get(provider)) {
      await fetchProvider(provider, submittedQ, 1, false);
    }
  };

  /** Quand on change le filtre image_type pour Pixabay, on re-fetch ce tab. */
  const onImageTypeChange = async (t: ImageType) => {
    setImageType(t);
    if (activeProvider === "pixabay" && submittedQ) {
      await fetchProvider("pixabay", submittedQ, 1, false);
    }
  };

  const onLoadMore = async () => {
    if (!activeProvider || !submittedQ) return;
    await fetchProvider(activeProvider, submittedQ, tab.page + 1, true);
  };

  const onImport = async (hit: SearchHit) => {
    setImportingId(hit.id);
    try {
      const fileName =
        hit.full_url.split("?")[0].split("/").pop() || `search-${hit.id}.png`;
      const resp = await importFromUrl(hit.full_url, sessionId, fileName);
      setSessionId(resp.session_id);
      const next: ImageState[] = resp.images.map((u) => ({
        id: u.id,
        name: u.name,
        hash: u.hash,
        originalBlobUrl: hit.thumb_url,
        cutoutBlobUrl: u.cutout_url ?? null,
        borderedBlobUrl: null,
        cutoutWidthPx: 0,
        cutoutHeightPx: 0,
        step: u.cutout_url ? "Génération du contour" : "En attente",
        error: null,
        unplaced: false,
        count: 1,
      }));
      addImages(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import échoué.");
    } finally {
      setImportingId(null);
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
        <span>Rechercher des images en ligne</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onSubmit();
            }}
            className="flex gap-2"
          >
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ex: chat cartoon, fleur, dragon, pizza…"
              className="flex-1 min-h-touch px-3 rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={tab.loading || q.trim().length === 0}
            >
              Chercher
            </button>
          </form>

          {/* Onglets par provider */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200">
            {providers.map((p) => {
              const active = p === activeProvider;
              const count = tabs.get(p)?.hits.length ?? 0;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => void onTabChange(p)}
                  title={PROVIDER_HINTS[p]}
                  className={`px-3 py-1.5 text-sm rounded-t-md transition-colors ${
                    active
                      ? "bg-accent text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  aria-pressed={active}
                >
                  {PROVIDER_LABELS[p]}
                  {count > 0 && (
                    <span className={`ml-1 text-xs ${active ? "opacity-90" : "text-slate-500"}`}>
                      ({count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filtre image_type — uniquement pour Pixabay */}
          {showImageTypeFilter && (
            <div className="flex flex-wrap gap-1">
              {IMAGE_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void onImageTypeChange(t.id)}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    imageType === t.id
                      ? "bg-accent text-white border-accent"
                      : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Hint provider */}
          {activeProvider && (
            <p className="text-xs text-slate-500">{PROVIDER_HINTS[activeProvider]}</p>
          )}

          {/* Erreur du tab actif */}
          {tab.error && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
              {tab.error}
            </p>
          )}

          {/* Résultats */}
          {!tab.loading && tab.hits.length === 0 && submittedQ && !tab.error && (
            <p className="text-xs text-slate-500">Aucun résultat sur ce provider.</p>
          )}
          {tab.loading && tab.hits.length === 0 && (
            <p className="text-xs text-slate-500">Chargement…</p>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {tab.hits.map((h) => {
              const importing = importingId === h.id;
              return (
                <button
                  key={`${activeProvider}-${h.id}-${h.thumb_url}`}
                  type="button"
                  onClick={() => void onImport(h)}
                  disabled={importing}
                  title={h.author ? `par ${h.author}` : undefined}
                  className="relative aspect-square rounded border border-slate-200 overflow-hidden bg-slate-50 hover:ring-2 hover:ring-accent disabled:opacity-50"
                >
                  <img
                    src={h.thumb_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-contain"
                    draggable={false}
                    referrerPolicy="no-referrer"
                  />
                  {importing && (
                    <div className="absolute inset-0 grid place-items-center bg-white/70 text-xs">
                      import…
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {tab.hasMore && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void onLoadMore()}
              disabled={tab.loading}
            >
              {tab.loading ? "Chargement…" : "Charger plus"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
