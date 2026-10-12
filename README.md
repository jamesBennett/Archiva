# Archiva

Archiva is a macOS photo library app for browsing, organizing, and preparing photo collections for long-term archival. It indexes photos where they already live and stores its catalog, albums, and generated previews in a separate library bundle. Original photos are never moved, renamed, converted, or edited by importing or organizing them.

The app is under active development. It is built with React, TypeScript, Tauri, and Rust, with a local SQLite database. No account, API key, or external database service is required.

## Features

- Create and open multiple `.archivalib` libraries, switch between recent libraries, and reveal the current library in Finder. Archiva attempts to reopen the most recent library on startup.
- Recursively index JPEG (`.jpg`, `.jpeg`), PNG, and HEIC folders, skipping paths already in the catalog.
- Browse a virtualized thumbnail grid, filter by year/month or folder, and search the folder tree by folder and file names.
- Inspect file details and available EXIF metadata, including camera, lens, exposure, dates, and GPS coordinates.
- Open a photo with a smooth expansion from its thumbnail, then fade in the decoded, higher-resolution preview. Reduced-motion preferences are respected.
- Navigate between photos in the current view with arrow keys or on-screen controls. Navigation keeps the current sharp image visible until the next preview is decoded, then switches immediately without an animation or thumbnail fade.
- Create, rename, delete, and reorder albums; add photos by dragging or using **Add to Collection**; remove photos from albums without deleting originals.
- Use thumbnail checkboxes to select multiple photos for album operations.
- Navigate back and forward through library views and resize the sidebar's folders/albums split.

Ratings, flags, color labels, favorites, smart-album editing, duplicate detection, automatic folder watching, export, and Quick Look integration are planned work. Some have database fields already, but they are not available as complete user-facing features. Photo editing, RAW, and video support are not currently implemented.

## Requirements

Development and app packaging require a Mac. The backend uses macOS filesystem APIs and the built-in `sips` image utility.

| Dependency | Setup |
| --- | --- |
| Node.js and npm | Use Node.js 24.x, or Node.js 22.13+ within the 22.x release line. The locked Vite, Vitest, and jsdom dependencies require a compatible Node version. |
| Rust and Cargo | Install the stable toolchain with [rustup](https://rustup.rs/). |
| Xcode Command Line Tools | Run `xcode-select --install`, or use an existing Xcode installation. |
| Git | Required to clone and work with the repository. |
| `sips` | Included with macOS; used to generate thumbnails and previews for all supported image formats. |

See the [Tauri macOS prerequisites](https://v2.tauri.app/start/prerequisites/#macos) for toolchain setup details. Xcode Command Line Tools are sufficient for desktop development; a full Xcode installation is optional for that workflow.

Verify your tools:

```sh
node --version
npm --version
rustc --version
cargo --version
xcode-select -p
sips --version
```

## Run the app in development

From the repository root:

```sh
npm ci
npm run tauri -- dev
```

This starts Vite at `http://localhost:1420`, compiles the Rust backend, and opens the native Archiva window. Frontend edits update through Vite; Rust edits trigger a rebuild. The first native compilation can take several minutes while Cargo downloads and compiles dependencies.

Tauri starts Vite automatically through `beforeDevCommand`. Keep port `1420` free before starting this command. Stop the development process with `Ctrl+C`.

There is no `.env` setup or manual database migration step. Archiva initializes a library's database when it creates or opens that library.

### Frontend development in a browser

```sh
npm run dev
```

This starts only Vite. The browser can load the frontend, but native dialogs, library access, scanning, and image generation require the Tauri runtime. Use `npm run tauri -- dev` for normal app development; isolated frontend tests mock native APIs.

## Use Archiva

1. Choose **New Library…**, enter a name, then choose its parent folder. To open an existing library, choose a recent entry or **Open Other…**.
2. Click **Add folder** and select a folder containing supported photos. Scanning includes subfolders; thumbnails appear as background generation completes.
3. Browse **By Year**, **By Folder**, or an album. Click a thumbnail to inspect its metadata, or double-click it to open the single-photo view.
4. Select thumbnail checkboxes and use **Add to Collection** to add photos to an existing album or create one. You can also drag a photo or selected group onto an album.
5. Right-click an album to rename or delete it. In an album, the remove control on a thumbnail removes its membership in that album.
6. Use the library menu in the toolbar to switch libraries or reveal the current bundle in Finder.

**Refresh** reloads the catalog; it does not rescan the original folders. To index newly added files, use **Add folder** on that folder again. Existing paths are skipped, so rescanning does not refresh metadata for already indexed photos.

| Action | Control |
| --- | --- |
| Inspect a photo's metadata | Click its thumbnail |
| Open a photo | Double-click its thumbnail |
| Previous / next photo in the current view | `←` / `→`, or the viewer buttons |
| Return to the grid | `Escape`, or double-click the viewer |
| Select photos for album operations | Thumbnail checkboxes |
| Rename / delete an album | Right-click its name |
| Navigate between previous library views | Toolbar back / forward buttons |

## Build the frontend

```sh
npm run build
```

This runs TypeScript checks and creates the production web assets in `dist/`. To serve those assets locally:

```sh
npm run preview
```

The preview server has the same native-API limitations as browser development. A frontend build alone does not create `Archiva.app` or a DMG.

## Create the macOS app and DMG

From the repository root on a Mac:

```sh
npm run tauri -- build
```

Tauri runs `npm run build` automatically, compiles the Rust backend in release mode, and packages both an application bundle and a DMG, as configured in [tauri.conf.json](src-tauri/tauri.conf.json).

With the default Cargo output directory and no explicit target, the outputs are:

```text
src-tauri/target/release/
├── archiva                       # Native executable
└── bundle/
    ├── macos/Archiva.app         # Standalone application
    └── dmg/Archiva_*.dmg         # Disk image; filename includes version/architecture
```

Launch the built app:

```sh
open src-tauri/target/release/bundle/macos/Archiva.app
```

To install it, open the DMG in Finder and drag **Archiva** into **Applications**. You can also copy `Archiva.app` from the `bundle/macos` directory into Applications. The packaged app runs without Vite, Node.js, or a Rust toolchain installed on the destination Mac.

Quit any running copy of Archiva before opening a new build. Building or replacing the app in Applications does not restart an existing process; macOS can bring an older running copy to the foreground, including one launched from another checkout.

### Build only the application bundle

```sh
npm run tauri -- build --bundles app
```

This creates `Archiva.app` and skips DMG creation. See Tauri's [macOS application bundle guide](https://v2.tauri.app/distribute/macos-application-bundle/) for packaging details.

### Build for Apple Silicon and Intel

The default build uses your Rust toolchain's host architecture. To create a universal app for both Apple Silicon and Intel Macs:

```sh
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri -- build --target universal-apple-darwin
```

Universal bundles are written under:

```text
src-tauri/target/universal-apple-darwin/release/bundle/
```

You can also pass `--target aarch64-apple-darwin` or `--target x86_64-apple-darwin` for a specific architecture. Explicit targets add their target name beneath `src-tauri/target/`; setting `CARGO_TARGET_DIR` changes the output root.

### Signing and distribution

The repository does not configure a Developer ID signing identity, notarization credentials, or an automated release pipeline. Creating a local app bundle does not produce a notarized public release.

For distribution outside the Mac App Store, install a **Developer ID Application** certificate, configure Tauri's `APPLE_SIGNING_IDENTITY` or `bundle.macOS.signingIdentity`, and provide notarization credentials through your build environment. Follow the official [macOS signing and notarization guide](https://v2.tauri.app/distribute/sign/macos/) for the complete process. Keep credentials out of the repository.

The app name, bundle identifier (`com.archiva.app`), bundle targets, and icons are configured in [tauri.conf.json](src-tauri/tauri.conf.json). When releasing a version, keep `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and the Tauri configuration consistent. [Info.plist](src-tauri/Info.plist) declares the `.archivalib` document/package type; icon assets live in [src-tauri/icons](src-tauri/icons/).

## Tests and checks

Run these commands from the repository root:

```sh
# Frontend type checking and production build
npm run build

# Frontend tests
npm test

# Frontend tests in watch mode
npm run test:watch

# Rust formatting, linting, and tests (macOS)
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

Frontend tests use Vitest, Testing Library, and jsdom. Rust tests cover database setup, scanning, EXIF parsing, image generation, library bundles, preferences, and migration. Database initialization is handled by the tests; no separate database server is needed.

[CI](.github/workflows/ci.yml) runs on pull requests targeting `main`. It builds and tests the frontend on Ubuntu with Node 20, and runs Rust formatting, Clippy, and tests on macOS with stable Rust. It currently does not package or publish app artifacts.

## Libraries and storage

Each library is a directory with the `.archivalib` extension. The packaged app registers that extension as a Finder package. In development it may appear as an ordinary folder.

```text
My Photos.archivalib/
├── Info.plist                 # Library package metadata
├── meta.json                  # Library UUID, name, schema and app versions
├── catalog.db                 # SQLite catalog, metadata, and album membership
├── thumbs/                    # JPEG thumbnails, up to 256 px on the longest edge
└── previews/                  # JPEG previews in 1024 / 2048 / 4096 px buckets
```

SQLite may also create `catalog.db-wal` and `catalog.db-shm` while a library is open. Close the library or quit Archiva before copying its complete bundle for backup.

Original photos remain at their indexed paths outside the bundle. **Backing up a library does not back up your original photos.** Keep a separate backup of the source folders. Moving a library preserves its catalog and cached images, but it does not update the original photo paths; moving or disconnecting source folders can prevent new previews from being generated. There is no relinking workflow yet.

Library bundles must reside on a local volume. Network volumes such as SMB/NFS are rejected because the catalog uses SQLite WAL. Local external drives can hold libraries, provided they remain connected and writable.

Recent-library preferences are stored in `prefs.json` in Tauri's app data directory, normally `~/Library/Application Support/com.archiva.app/` on macOS. The sidebar split preference uses webview local storage.

For older installations, startup can migrate the legacy app-data `archiva.db` into a new `Archiva.archivalib` bundle in Pictures (using a numbered name if needed). The old database is retained as `archiva.db.migrated` after a successful migration.

## Architecture and project layout

| Area | Technology / responsibility |
| --- | --- |
| Desktop shell | Tauri 2, native macOS webview and dialogs |
| Frontend | React 19, strict TypeScript, Vite 7 |
| Styling and UI | Tailwind CSS 3, Radix UI, dnd-kit |
| Client state and grid | Zustand, TanStack Virtual |
| Backend | Rust, Tokio, Tauri commands |
| Catalog | SQLite with SQLx and raw SQL; schema initialization in `db.rs` |
| Photos | WalkDir scanning, `kamadak-exif` metadata, macOS `sips` thumbnails/previews |

```text
src/
├── App.tsx                    # Library startup / picker
├── pages/Library.tsx          # Main layout and drag-and-drop coordination
├── components/                # Grid, viewer, metadata, library and album UI
│   └── sidenav/               # Date/folder trees and album navigation
├── hooks/                     # Library, photo, album, and preview operations
├── lib/tauri.ts               # Typed wrappers around backend commands
├── store/useLibraryStore.ts   # Shared state, navigation, selection, view mode
├── types/                     # Shared frontend data types
└── test/                      # Frontend test setup; tests also live beside code
src-tauri/
├── src/
│   ├── lib.rs                 # Tauri setup, startup, and command registration
│   ├── commands/              # Photo, album, library, and image operations
│   ├── db.rs                  # SQLite connections and schema
│   ├── library.rs             # Bundle creation and validation
│   ├── state.rs               # Active library and database pool
│   ├── prefs.rs               # Recent libraries
│   └── legacy.rs              # Migration from the original app-data catalog
├── tests/                     # Rust integration tests and fixtures
├── capabilities/              # Tauri permissions
├── icons/                     # App icons
├── Info.plist                 # Library document type declarations
└── tauri.conf.json            # App identity, window, build, and bundling
```

UI components call hooks, which use the typed command wrappers to invoke Rust operations. The backend owns filesystem access, SQLite, and generated image caches. Image conversion runs in blocking worker tasks; thumbnail work is queued in the background after indexing.

Keep photo operations non-destructive, use raw SQL rather than an ORM, and keep backend command calls behind hooks and typed wrappers. Historical designs and implementation plans live in [docs/superpowers](docs/superpowers/); the current implementation is the reference for shipped behavior.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `cargo` / `rustc` not found | Install stable Rust with rustup and open a new terminal so its PATH changes take effect. |
| Compiler or linker cannot find macOS tools | Run `xcode-select -p`; install Command Line Tools or finish setting up Xcode. |
| npm reports an unsupported Node engine | Use the Node version described under Requirements, then rerun `npm ci`. |
| Port `1420` is already in use | Stop the other dev server. `tauri dev` starts its own Vite process. If changing the port, update both `vite.config.ts` and Tauri's `devUrl`. |
| Browser UI cannot access libraries or dialogs | Start the native app with `npm run tauri -- dev`. |
| A folder scan finds no new photos | Check the supported extensions and whether those paths are already indexed. **Refresh** only reloads the catalog. |
| Thumbnails are still loading | Allow background generation to finish. Check that original files are readable and `sips` is available. |
| Viewer says **Preview failed** | Check that the source folder/drive is available and readable. Cached thumbnails can remain visible even when the original is unavailable. |
| Recent library is marked missing | Reconnect its drive or use **Open Other…** to select its new location. |
| A library is rejected | Select a valid `.archivalib` bundle on a local volume. Libraries with a newer schema require a newer app version. |
| Frontend build succeeded but no app exists | Run `npm run tauri -- build`; `npm run build` creates only `dist/`. |
| App still shows old behavior after rebuilding | Quit Archiva completely, then open the exact `.app` you just built or updated in Applications. To identify the running copy, run `ps -ax -o pid,command` and look for the `Archiva.app/Contents/MacOS/archiva` path. |
| DMG packaging fails | Run `npm run tauri -- build --bundles app` to isolate app creation, and inspect the DMG bundler's terminal error. |

For backend diagnostics during development:

```sh
RUST_LOG=archiva_lib=debug npm run tauri -- dev
```
