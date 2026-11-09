# StoreHub Desktop (Windows)

Tauri v2 shell that loads the deployed StoreHub web app inside a native
Windows window. Mirrors the Android (Capacitor) strategy: the desktop app is
a lightweight wrapper, so web updates ship instantly without rebuilding the
`.exe`.

## Why Tauri v2

- ~10–20 MB installer (vs ~200 MB for Electron) — uses the WebView2 runtime
  already built into Windows 10/11.
- Low RAM/CPU footprint — suitable for an app merchants keep open all day.
- Official auto-updater plugin + NSIS installer targets.
- Custom frameless window (`decorations: false`) with an in-app
  `DesktopTitleBar` matching the StoreHub dark theme.

## Prerequisites

- Node.js 20+
- Rust toolchain (`rustup` → https://rustup.rs)
- WebView2 Runtime (preinstalled on Windows 10/11; required on Windows 7/8.1)

## Develop

```bash
# from repo root — starts `next dev` automatically, then opens the window
npm run desktop:dev
```

The dev build loads `http://localhost:3000` (requires `npm run dev` running —
handled by `beforeDevCommand`).

## Build the installer (NSIS)

```bash
# 1. Point the app at your production URL
#    desktop/.env.local → STOREHUB_URL=https://your-domain.com

# 2. Build
npm run desktop:build
```

Output: `desktop/src-tauri/target/release/bundle/nsis/StoreHub_*_x64-setup.exe`

## Auto-updates (GitHub Releases)

1. Generate a signing keypair once:
   ```bash
   npm --prefix desktop exec tauri signer generate -w ~/.tauri/storehub.key
   ```
2. Put the printed **public key** into `src-tauri/tauri.conf.json`
   → `plugins.updater.pubkey` (currently `REPLACE_WITH_UPDATER_PUBLIC_KEY`).
3. Keep the private key safe (`~/.tauri/storehub.key` + password). Never commit it.
4. For each release: bump `version` in `tauri.conf.json`, build, then upload to a
   GitHub Release on `rootsec26/StoreHub`:
   - `StoreHub_<version>_x64-setup.exe` (NSIS installer)
   - `StoreHub_<version>_x64-setup.exe.sig` (updater signature)
   - `latest.json` (generated in `target/release/bundle/nsis/` when
     `createUpdaterArtifacts` is enabled)

The updater endpoint is already configured to
`https://github.com/rootsec26/StoreHub/releases/latest/download/latest.json`.

## Layout

```
desktop/
  package.json          # Tauri CLI devDependency + scripts
  .env.example          # STOREHUB_URL config
  dist/index.html       # placeholder frontendDist (window loads remote URL)
  src-tauri/
    Cargo.toml          # tauri + updater plugin
    build.rs            # embeds STOREHUB_URL / NEXT_PUBLIC_SITE_URL
    src/main.rs         # creates undecorated window → external StoreHub URL
    tauri.conf.json     # productName, NSIS bundle, updater endpoints
    capabilities/       # window-control + updater permissions
    icons/              # generated from public/icon.png (tauri icon)
```

Frontend counterpart: `src/components/desktop/DesktopTitleBar.tsx` renders the
custom title bar only when running inside Tauri (invisible on the web).
