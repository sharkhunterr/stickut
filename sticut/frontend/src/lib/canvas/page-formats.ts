/** Formats de feuille standardisés.
 *  L'utilisateur peut sélectionner l'un d'eux ou définir un format personnalisé.
 *  Toutes dimensions en mm, orientation portrait par défaut (largeur ≤ hauteur). */

export interface PageFormat {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const PAGE_FORMATS: PageFormat[] = [
  { id: "A4", label: "A4 (210 × 297 mm)", widthMm: 210, heightMm: 297 },
  { id: "A3", label: "A3 (297 × 420 mm)", widthMm: 297, heightMm: 420 },
  { id: "A5", label: "A5 (148 × 210 mm)", widthMm: 148, heightMm: 210 },
  { id: "A6", label: "A6 (105 × 148 mm)", widthMm: 105, heightMm: 148 },
  { id: "Letter", label: "Letter US (216 × 279 mm)", widthMm: 215.9, heightMm: 279.4 },
  { id: "Legal", label: "Legal US (216 × 356 mm)", widthMm: 215.9, heightMm: 355.6 },
  { id: "Cricut-PTC", label: "Cricut Print Then Cut (165 × 235 mm)", widthMm: 165, heightMm: 235 },
  { id: "BusinessCard", label: "Carte de crédit (85 × 55 mm)", widthMm: 85, heightMm: 55 },
];

export const CUSTOM_FORMAT_ID = "Custom";

export function getFormat(id: string): PageFormat | null {
  return PAGE_FORMATS.find((f) => f.id === id) ?? null;
}
