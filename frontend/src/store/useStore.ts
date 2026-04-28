import { create } from "zustand";
import type { FrameTemplateSummary, ImageStep, ModelName, StickerOverride } from "../types";

// IMPORTANT: this store is held in React state ONLY. We never persist it to
// localStorage / sessionStorage / cookies / IndexedDB. A page refresh resets
// every field — which is intentional per FR-046b (Q1 clarification).

export interface ImageState {
  id: string;
  name: string;
  hash: string;
  originalBlobUrl: string;
  cutoutBlobUrl: string | null;
  borderedBlobUrl: string | null;
  cutoutWidthPx: number;
  cutoutHeightPx: number;
  step: ImageStep;
  error: string | null;
  unplaced: boolean;
  /** Combien de copies du même sticker placer sur la planche. ≥ 1. */
  count: number;
}

export type SizeMode = "fixed" | "range";

export interface Settings {
  sizeMode: SizeMode;
  sizeFixedMm: number;
  sizeMinMm: number;
  sizeMaxMm: number;
  borderThicknessMm: number;
  spacingMm: number;
  outerMarginMm: number;
  model: ModelName;
  alphaMatting: boolean;
  /** Format de feuille : id parmi PAGE_FORMATS ou "Custom". */
  pageFormatId: string;
  pageWidthMm: number;
  pageHeightMm: number;
}

export interface FrameState {
  selectedId: string | null; // null = "Sans cadre"
  color: string; // hex
  headerText: string; // up to 60 chars
}

export type Overrides = Record<string, StickerOverride>;

export interface StickutStore {
  sessionId: string | null;
  taskId: string | null;
  images: ImageState[];
  templates: FrameTemplateSummary[];
  settings: Settings;
  frame: FrameState;
  globalError: string | null;

  // Layout interactif : overrides utilisateur + historique pour undo/redo.
  // historyIndex pointe sur le snapshot courant ; tout après est "redo".
  history: Overrides[];
  historyIndex: number;

  reset: () => void;
  setSessionId: (id: string | null) => void;
  setTaskId: (id: string | null) => void;
  addImages: (imgs: ImageState[]) => void;
  patchImage: (id: string, patch: Partial<ImageState>) => void;
  markImageUnplaced: (id: string, unplaced: boolean) => void;
  resetImageCutouts: () => void;
  setImageCount: (id: string, count: number) => void;
  setTemplates: (t: FrameTemplateSummary[]) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setFrame: (patch: Partial<FrameState>) => void;
  setGlobalError: (msg: string | null) => void;

  // Édition interactive du layout
  setOverride: (id: string, ov: StickerOverride, commit: boolean) => void;
  resetOverrides: () => void;
  undo: () => void;
  redo: () => void;

  // Bumpé à chaque modification de config runtime → permet aux composants
  // (SearchPanel) de se réabonner au /api/config.
  configVersion: number;
  bumpConfigVersion: () => void;

  // True pendant qu'un traitement de détourage est en cours.
  processing: boolean;
  setProcessing: (v: boolean) => void;
}

const DEFAULT_SETTINGS: Settings = {
  sizeMode: "fixed",
  sizeFixedMm: 50,
  sizeMinMm: 30,
  sizeMaxMm: 60,
  borderThicknessMm: 2.5,
  spacingMm: 3,
  outerMarginMm: 10,
  model: "isnet-general-use",
  alphaMatting: false,
  pageFormatId: "A4",
  pageWidthMm: 210,
  pageHeightMm: 297,
};

const DEFAULT_FRAME: FrameState = {
  selectedId: null,
  color: "#1f2933",
  headerText: "",
};

const HISTORY_LIMIT = 50;

export const useStore = create<StickutStore>((set) => ({
  sessionId: null,
  taskId: null,
  images: [],
  templates: [],
  settings: { ...DEFAULT_SETTINGS },
  frame: { ...DEFAULT_FRAME },
  globalError: null,
  history: [{}],
  historyIndex: 0,
  configVersion: 0,
  processing: false,

  reset: () =>
    set({
      sessionId: null,
      taskId: null,
      images: [],
      settings: { ...DEFAULT_SETTINGS },
      frame: { ...DEFAULT_FRAME },
      globalError: null,
      history: [{}],
      historyIndex: 0,
    }),

  setSessionId: (id) => set({ sessionId: id }),
  setTaskId: (id) => set({ taskId: id }),
  addImages: (imgs) => set((s) => ({ images: [...s.images, ...imgs] })),
  patchImage: (id, patch) =>
    set((s) => ({
      images: s.images.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  markImageUnplaced: (id, unplaced) =>
    set((s) => {
      const current = s.images.find((it) => it.id === id);
      // No-op when la valeur est inchangée — sinon on créerait une nouvelle
      // array à chaque render d'A4Preview, ce qui déclencherait une boucle
      // de re-render et bloquerait le preview en "rendu en cours".
      if (!current || current.unplaced === unplaced) return {};
      return {
        images: s.images.map((it) => (it.id === id ? { ...it, unplaced } : it)),
      };
    }),
  resetImageCutouts: () =>
    set((s) => ({
      images: s.images.map((it) => ({
        ...it,
        cutoutBlobUrl: null,
        borderedBlobUrl: null,
        cutoutWidthPx: 0,
        cutoutHeightPx: 0,
        step: "En attente" as const,
        error: null,
        unplaced: false,
      })),
    })),
  setImageCount: (id, count) =>
    set((s) => {
      const clamped = Math.max(1, Math.min(99, Math.round(count)));
      const current = s.images.find((it) => it.id === id);
      if (!current || current.count === clamped) return {};
      return {
        images: s.images.map((it) => (it.id === id ? { ...it, count: clamped } : it)),
      };
    }),
  setTemplates: (t) =>
    set((s) => {
      // If the currently selected frame disappeared, fall back to "Sans cadre".
      const stillThere =
        s.frame.selectedId === null || t.some((tpl) => tpl.id === s.frame.selectedId);
      return {
        templates: t,
        frame: stillThere ? s.frame : { ...s.frame, selectedId: null },
      };
    }),
  setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setFrame: (patch) => set((s) => ({ frame: { ...s.frame, ...patch } })),
  setGlobalError: (msg) => set({ globalError: msg }),

  // setOverride(id, ov, commit):
  //   commit=false → on remplace juste le snapshot courant (utile pendant un drag,
  //                 pour ne pas spammer l'historique avec chaque pixel).
  //   commit=true  → on tronque tout après l'index courant et on push un nouveau snapshot
  //                 (un step undo).
  setOverride: (id, ov, commit) =>
    set((s) => {
      const current = s.history[s.historyIndex] ?? {};
      const next: Overrides = { ...current, [id]: ov };
      if (!commit) {
        const history = s.history.slice();
        history[s.historyIndex] = next;
        return { history };
      }
      const truncated = s.history.slice(0, s.historyIndex + 1);
      truncated[s.historyIndex] = next; // remplace le snapshot live
      const pushed = [...truncated, next]; // puis push pour avoir un step undo séparé
      const trimmed =
        pushed.length > HISTORY_LIMIT ? pushed.slice(pushed.length - HISTORY_LIMIT) : pushed;
      return { history: trimmed, historyIndex: trimmed.length - 1 };
    }),

  resetOverrides: () =>
    set((s) => {
      const current = s.history[s.historyIndex] ?? {};
      if (Object.keys(current).length === 0) return {};
      const truncated = s.history.slice(0, s.historyIndex + 1);
      const pushed = [...truncated, {}];
      const trimmed =
        pushed.length > HISTORY_LIMIT ? pushed.slice(pushed.length - HISTORY_LIMIT) : pushed;
      return { history: trimmed, historyIndex: trimmed.length - 1 };
    }),

  undo: () =>
    set((s) => (s.historyIndex > 0 ? { historyIndex: s.historyIndex - 1 } : {})),
  redo: () =>
    set((s) =>
      s.historyIndex < s.history.length - 1 ? { historyIndex: s.historyIndex + 1 } : {},
    ),
  bumpConfigVersion: () => set((s) => ({ configVersion: s.configVersion + 1 })),
  setProcessing: (v) => set({ processing: v }),
}));
