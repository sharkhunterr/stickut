import { useStore } from "../store/useStore";
import { ImageCard } from "./ImageCard";

export function ImageGrid() {
  const images = useStore((s) => s.images);
  if (images.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {images.map((img) => (
        <ImageCard key={img.id} image={img} />
      ))}
    </div>
  );
}
