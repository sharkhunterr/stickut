import { useEffect, useRef, useState } from "react";

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ZoomModal({ src, alt, onClose }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pinch = useRef<{
    initialDistance: number;
    initialScale: number;
    midX: number;
    midY: number;
  } | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function distance(
    t1: { clientX: number; clientY: number },
    t2: { clientX: number; clientY: number },
  ): number {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center touch-none"
      onClick={(e) => {
        if (e.target === wrapRef.current) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        className="absolute top-3 right-3 min-h-touch min-w-touch rounded-full bg-white/90 text-slate-900 px-4 font-medium"
        onClick={onClose}
        aria-label="Fermer"
      >
        Fermer
      </button>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-[90vw] max-h-[90vh] object-contain select-none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "center center",
          transition: pinch.current || drag.current ? "none" : "transform 120ms ease-out",
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const [a, b] = [e.touches[0], e.touches[1]];
            pinch.current = {
              initialDistance: distance(a, b),
              initialScale: scale,
              midX: (a.clientX + b.clientX) / 2,
              midY: (a.clientY + b.clientY) / 2,
            };
          } else if (e.touches.length === 1 && scale > 1) {
            const t = e.touches[0];
            drag.current = { x: t.clientX, y: t.clientY, px: pan.x, py: pan.y };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinch.current) {
            const [a, b] = [e.touches[0], e.touches[1]];
            const newDist = distance(a, b);
            const next = Math.min(
              6,
              Math.max(1, pinch.current.initialScale * (newDist / pinch.current.initialDistance)),
            );
            setScale(next);
            if (next === 1) setPan({ x: 0, y: 0 });
          } else if (e.touches.length === 1 && drag.current) {
            const t = e.touches[0];
            setPan({
              x: drag.current.px + (t.clientX - drag.current.x),
              y: drag.current.py + (t.clientY - drag.current.y),
            });
          }
        }}
        onTouchEnd={(e) => {
          if (e.touches.length < 2) pinch.current = null;
          if (e.touches.length === 0) drag.current = null;
        }}
        onDoubleClick={() => {
          if (scale > 1) {
            setScale(1);
            setPan({ x: 0, y: 0 });
          } else {
            setScale(2);
          }
        }}
      />
    </div>
  );
}
