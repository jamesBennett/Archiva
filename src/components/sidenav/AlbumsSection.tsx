import { useAlbums } from "../../hooks/useAlbums";
import { AlbumList } from "./AlbumList";

export function AlbumsSection() {
  const { albums, create } = useAlbums();

  async function handleCreate() {
    const name = window.prompt("Album name");
    const trimmed = name?.trim();
    if (!trimmed) return;
    try {
      await create(trimmed);
    } catch (e) {
      console.error("create album failed", e);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <h2 className="text-xs uppercase tracking-wide text-muted">Albums</h2>
        <button
          type="button"
          onClick={() => void handleCreate()}
          aria-label="New album"
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-panel-hover hover:text-white"
        >
          <span className="text-base leading-none">+</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
        <AlbumList albums={albums} />
      </div>
    </section>
  );
}
