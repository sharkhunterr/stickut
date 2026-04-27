import { useCallback, useRef, useState } from "react";

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/heic,image/heif,image/avif,.heic,.heif,.avif";

interface Props {
  onFiles: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
}

export function UploadZone({ onFiles, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const pickFiles = useCallback(() => inputRef.current?.click(), []);
  const handle = useCallback(
    (list: FileList | null) => {
      if (!list || list.length === 0) return;
      onFiles(Array.from(list));
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFiles],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={pickFiles}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") pickFiles();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        handle(e.dataTransfer.files);
      }}
      aria-disabled={disabled}
      className={`min-h-touch w-full rounded-xl border-2 border-dashed px-4 py-10 text-center cursor-pointer select-none transition-colors ${
        hover ? "border-accent bg-blue-50" : "border-slate-300 bg-white"
      } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <p className="text-lg font-medium">Glissez-déposez vos images ici</p>
      <p className="text-sm text-slate-500 mt-1">
        ou tapez pour ouvrir l'explorateur de fichiers
      </p>
      <p className="text-xs text-slate-400 mt-3">
        JPEG, PNG, WebP, GIF, BMP, TIFF, HEIC, HEIF, AVIF
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
