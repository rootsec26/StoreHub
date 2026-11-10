#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Resolves the StoreHub web app URL the desktop shell should load.
///
/// Priority:
///   1. `STOREHUB_URL` env var at runtime (useful for local testing)
///   2. `STOREHUB_URL` / `NEXT_PUBLIC_SITE_URL` baked in at compile time
///      (desktop/.env, desktop/.env.local, or the shell environment)
///   3. `http://localhost:3000` in debug builds, `https://storehub.app` placeholder
///      in release builds — set STOREHUB_URL before `tauri build` for production.
fn storehub_url() -> String {
    if let Ok(url) = std::env::var("STOREHUB_URL") {
        let url = url.trim();
        if !url.is_empty() {
            return url.to_string();
        }
    }

    let baked = option_env!("STOREHUB_URL")
        .or_else(|| option_env!("NEXT_PUBLIC_SITE_URL"));
    if let Some(url) = baked {
        let url = url.trim();
        if !url.is_empty() {
            return url.to_string();
        }
    }

    if cfg!(debug_assertions) {
        "http://localhost:3000".to_string()
    } else {
        // Placeholder — always override with STOREHUB_URL for release builds.
        "http://localhost:3000".to_string()
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let url = storehub_url();
            let parsed = url
                .parse()
                .unwrap_or_else(|_| panic!("Invalid StoreHub URL: {url}"));

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
                .title("StoreHub")
                .inner_size(1440.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .decorations(false)
                .resizable(true)
                .center()
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running StoreHub desktop app");
}
