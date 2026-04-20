# CI Setup — Design

**Date:** 2026-04-19
**Status:** Approved

## Goal

Add GitHub Actions CI that runs on pull requests targeting `main` and blocks merges until checks pass. No deployment pipeline yet.

## Trigger

```yaml
on:
  pull_request:
    branches: [main]
```

No `push` trigger. This avoids burning macOS minutes on every feature-branch commit; CI only runs once a PR is opened.

## Jobs

Two parallel jobs. Both must pass for merge.

### `frontend` — ubuntu-latest

1. `actions/checkout@v4`
2. `actions/setup-node@v4` with `node-version: 20` and `cache: npm`
3. `npm ci`
4. `npm run build` — runs `tsc && vite build` (covers typecheck + build)
5. `npm test` — runs `vitest run`

### `rust` — macos-latest

1. `actions/checkout@v4`
2. `dtolnay/rust-toolchain@stable` with `components: rustfmt, clippy`
3. `Swatinem/rust-cache@v2` scoped to `src-tauri/` (caches cargo registry, git, and `target/` keyed on `Cargo.lock`)
4. `cargo fmt --all -- --check` (working dir `src-tauri`)
5. `cargo clippy --all-targets --locked -- -D warnings`
6. `cargo test --locked`

macOS runner is required because Archiva is macOS-only and shells out to `sips`. Tauri on macOS needs no extra system dependencies.

## Cost

Private repo. Per PR push, roughly:
- Linux frontend: ~2 min × 1 = 2 billed minutes
- macOS rust: ~4–6 min × 10 = 40–60 billed minutes

About **50 min per PR run**. Free plan = 2,000 min/month ≈ 40 PR runs. `Swatinem/rust-cache` cuts rust runtime significantly on warm cache.

## Merge protection

Not automated. User configures in GitHub UI after first CI run lands the check names.

### GitHub UI setup checklist

1. Push branch, open a PR to `main`, let the workflow run once so `frontend` and `rust` appear as registered checks.
2. **Settings → Branches → Add branch ruleset** (or classic "Branch protection rules") targeting `main`.
3. Enable:
   - Require a pull request before merging
   - Require status checks to pass before merging
     - Required checks: `frontend`, `rust`
     - Require branches to be up to date before merging
   - Block force pushes
   - Restrict deletions
4. Save.

## Out of scope

- Deployment / release automation
- Code coverage reporting
- Required reviewers (solo dev)
- Running Rust checks on Linux (would skip `sips`-dependent paths; not worth the split now)
- Push-trigger CI on feature branches
