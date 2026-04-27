import { useStore } from "../store/useStore";
import { ImageCard } from "./ImageCard";

export function ImageGrid() {
  const images = useStore((s) => s.images);
  if (images.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {images.map((img) => (
        <ImageCard key={img.id} image={img} />
      ))}
    </div>
  );
}
