import { useAlbums } from "../../hooks/useAlbums";
import { AlbumList } from "./AlbumList";

export function AlbumsSection() {
  const { albums } = useAlbums();
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <h2 className="text-xs uppercase tracking-wide text-muted">Albums</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        <AlbumList albums={albums} />
      </div>
    </section>
  );
}
