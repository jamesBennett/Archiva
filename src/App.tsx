import { LibraryPicker } from "./components/LibraryPicker";
import { useLibrary } from "./hooks/useLibrary";
import { Library } from "./pages/Library";

export default function App() {
  const { current, loading } = useLibrary();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bg text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (!current) return <LibraryPicker />;
  // Keyed remount: switching libraries resets all page-level state and refetches.
  return <Library key={current.uuid} />;
}
