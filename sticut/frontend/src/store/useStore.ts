import { create } from "zustand";
import type { FrameTemplateSummary, ImageStep, ModelName } from "../types";

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
}

export interface FrameState {
  selectedId: string | null; // null = "Sans cadre"
  color: string; // hex
  headerText: string; // up to 60 chars
}

export interface StickutStore {
  sessionId: string | null;
  taskId: string | null;
  images: ImageState[];
  templates: FrameTemplateSummary[];
  settings: Settings;
  frame: FrameState;
  globalError: string | null;

  reset: () => void;
  setSessionId: (id: string | null) => void;
  setTaskId: (id: string | null) => void;
  addImages: (imgs: ImageState[]) => void;
  patchImage: (id: string, patch: Partial<ImageState>) => void;
  markImageUnplaced: (id: string, unplaced: boolean) => void;
  setTemplates: (t: FrameTemplateSummary[]) => void;
  setSettings: (patch: Partial<Settings>) => void;
  setFrame: (patch: Partial<FrameState>) => void;
  setGlobalError: (msg: string | null) => void;
}

const DEFAULT_SETTINGS: Settings = {
  sizeMode: "fixed",
  sizeFixedMm: 50,
  sizeMinMm: 30,
  sizeMaxMm: 60,
  borderThicknessMm: 2.5,
  spacingMm: 3,
  outerMarginMm: 10,
  model: "birefnet-general",
  alphaMatting: false,
};

const DEFAULT_FRAME: FrameState = {
  selectedId: null,
  color: "#1f2933",
  headerText: "",
};

export const useStore = create<StickutStore>((set) => ({
  sessionId: null,
  taskId: null,
  images: [],
  templates: [],
  settings: { ...DEFAULT_SETTINGS },
  frame: { ...DEFAULT_FRAME },
  globalError: null,

  reset: () =>
    set({
      sessionId: null,
      taskId: null,
      images: [],
      settings: { ...DEFAULT_SETTINGS },
      frame: { ...DEFAULT_FRAME },
      globalError: null,
    }),

  setSessionId: (id) => set({ sessionId: id }),
  setTaskId: (id) => set({ taskId: id }),
  addImages: (imgs) => set((s) => ({ images: [...s.images, ...imgs] })),
  patchImage: (id, patch) =>
    set((s) => ({
      images: s.images.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    })),
  markImageUnplaced: (id, unplaced) =>
    set((s) => ({
      images: s.images.map((it) => (it.id === id ? { ...it, unplaced } : it)),
    })),
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
}));
