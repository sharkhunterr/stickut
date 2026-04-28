/**
 * Inject the user-chosen color and header text into a frame template SVG.
 * Pure function: no DOM mounting, no side effects.
 */

const PARSER = new DOMParser();
const SERIALIZER = new XMLSerializer();

export function injectFrame(svgText: string, color: string, header: string): string {
  const doc = PARSER.parseFromString(svgText, "image/svg+xml");
  const root = doc.documentElement;

  // Replace fill (and stroke if set) on every frame-color marker.
  const colorTargets = root.querySelectorAll("[data-stickut='frame-color']");
  colorTargets.forEach((el) => {
    const node = el as SVGElement;
    if (node.getAttribute("fill") !== null || node.tagName.toLowerCase() === "g") {
      node.setAttribute("fill", color);
    } else {
      node.setAttribute("fill", color);
    }
    if (node.getAttribute("stroke") !== null && node.getAttribute("stroke") !== "none") {
      node.setAttribute("stroke", color);
    }
  });

  // Header text: replace content + fill, or hide if empty.
  const headerEl = root.querySelector("[data-stickut='header-text']") as SVGElement | null;
  if (headerEl) {
    const trimmed = header.trim();
    if (trimmed === "") {
      headerEl.setAttribute("display", "none");
    } else {
      headerEl.removeAttribute("display");
      headerEl.textContent = trimmed;
      headerEl.setAttribute("fill", color);
    }
  }

  return SERIALIZER.serializeToString(root);
}

/**
 * Rasterise an SVG string at the requested pixel dimensions onto a canvas.
 */
export async function rasterizeSvgToCanvas(
  svgText: string,
  widthPx: number,
  heightPx: number,
): Promise<HTMLCanvasElement> {
  const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Cadre illisible"));
      i.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponible");
    ctx.drawImage(img, 0, 0, widthPx, heightPx);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}
