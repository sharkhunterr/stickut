import type {
  CacheClearResponse,
  FrameTemplateSummary,
  HealthResponse,
  ModelName,
  ProcessRequest,
  ProcessResponse,
  UploadResponse,
} from "../types";

const API = "/api";

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body && typeof body.detail === "string") {
        detail = body.detail;
      }
    } catch {
      // body wasn't JSON; keep status-based message
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function uploadImages(files: File[], sessionId?: string): Promise<UploadResponse> {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const url = sessionId ? `${API}/upload?session_id=${encodeURIComponent(sessionId)}` : `${API}/upload`;
  const res = await fetch(url, { method: "POST", body: fd });
  return parseJson<UploadResponse>(res);
}

export async function startProcess(req: ProcessRequest): Promise<ProcessResponse> {
  const res = await fetch(`${API}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return parseJson<ProcessResponse>(res);
}

export function getCutoutUrl(hash: string, model: ModelName | "passthrough" = "birefnet-general"): string {
  return `${API}/cutout/${encodeURIComponent(hash)}?model=${encodeURIComponent(model)}`;
}

export async function listTemplates(): Promise<FrameTemplateSummary[]> {
  const res = await fetch(`${API}/templates`);
  return parseJson<FrameTemplateSummary[]>(res);
}

export function getTemplateUrl(id: string): string {
  return `${API}/templates/${encodeURIComponent(id)}`;
}

export async function getTemplateSvg(id: string): Promise<string> {
  const res = await fetch(getTemplateUrl(id));
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.text();
}

export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API}/health`);
  return parseJson<HealthResponse>(res);
}

export async function clearCache(): Promise<CacheClearResponse> {
  const res = await fetch(`${API}/cache/clear`, { method: "POST" });
  return parseJson<CacheClearResponse>(res);
}

// ----- Recherche d'images en ligne -----

export interface SearchHit {
  id: string;
  thumb_url: string;
  full_url: string;
  width: number;
  height: number;
  author: string | null;
  source_url: string | null;
  license: string | null;
}

export type SearchProvider = "pixabay" | "openverse" | "wikimedia" | "iconify";
export type ImageType = "all" | "photo" | "illustration" | "vector";

export interface SearchResponse {
  provider: SearchProvider;
  hits: SearchHit[];
  total: number;
  page: number;
  per_page: number;
}

export async function searchImages(
  q: string,
  page = 1,
  opts?: { provider?: SearchProvider; imageType?: ImageType },
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q, page: String(page), per_page: "20" });
  if (opts?.provider) params.set("provider", opts.provider);
  if (opts?.imageType) params.set("image_type", opts.imageType);
  const res = await fetch(`${API}/search?${params}`);
  return parseJson<SearchResponse>(res);
}

export async function importFromUrl(
  url: string,
  sessionId: string | null,
  name?: string,
): Promise<UploadResponse> {
  const res = await fetch(`${API}/search/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, url, name }),
  });
  return parseJson<UploadResponse>(res);
}

// ----- Runtime config (clé Pixabay, activation recherche) -----

export interface RuntimeConfigResponse {
  enable_search: boolean;
  pixabay_api_key_set: boolean;
  search_provider: SearchProvider | null;
  available_providers: SearchProvider[];
  env_locked: { enable_search: boolean; pixabay_api_key: boolean };
}

export async function getRuntimeConfig(): Promise<RuntimeConfigResponse> {
  const res = await fetch(`${API}/config`);
  return parseJson<RuntimeConfigResponse>(res);
}

export async function setRuntimeConfig(patch: {
  enable_search?: boolean;
  pixabay_api_key?: string; // chaîne vide = retirer la clé
}): Promise<RuntimeConfigResponse> {
  const res = await fetch(`${API}/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return parseJson<RuntimeConfigResponse>(res);
}
