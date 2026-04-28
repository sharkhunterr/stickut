export type ModelName =
  | "birefnet-general"
  | "isnet-general-use"
  | "u2net"
  | "isnet-anime";

export type ImageStep =
  | "En attente"
  | "Décodage"
  | "Détourage IA"
  | "Génération du contour"
  | "Mise en page"
  | "Terminé"
  | "Échec";

export interface UploadResponseImage {
  id: string;
  name: string;
  hash: string;
  cutout_url?: string | null;
}

export interface UploadResponse {
  session_id: string;
  images: UploadResponseImage[];
}

export interface ProcessRequest {
  session_id: string;
  model?: ModelName;
  alpha_matting?: boolean;
}

export interface ProcessResponse {
  task_id: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameTemplateSummary {
  id: string;
  name: string;
  preview_url: string;
  sticker_area: Rect;
  supports_color: boolean;
  supports_header: boolean;
}

export interface HealthResponse {
  status: "ok";
  models_loaded: string[];
  cache_size_mb: number;
  search_enabled?: boolean;
  search_provider?: "pixabay" | "openverse" | null;
}

export interface CacheClearResponse {
  deleted: number;
}

export interface SSEImageStarted {
  image_id: string;
  name: string;
  step: ImageStep;
}

export interface SSEImageProgress {
  image_id: string;
  step: ImageStep;
}

export interface SSEImageDone {
  image_id: string;
  cutout_url: string;
}

export interface SSEImageFailed {
  image_id: string;
  error: string;
}

export interface SSEComplete {
  processed: number;
  failed: number;
}

/** Override utilisateur pour un sticker placé manuellement dans le preview.
 *  Si présent, remplace les valeurs auto-calculées par le packing.
 *  - xMm, yMm    : coin haut-gauche du rectangle (sans rotation)
 *  - widthMm, heightMm : dimensions avant rotation
 *  - angleDeg    : rotation autour du centre, en degrés (0 = naturel)
 */
export interface StickerOverride {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  angleDeg: number;
}
