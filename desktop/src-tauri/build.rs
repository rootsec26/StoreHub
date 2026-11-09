fn main() {
    // Load desktop/.env* files so STOREHUB_URL can be configured per machine.
    let _ = dotenvy::from_filename("../.env");
    let _ = dotenvy::from_filename("../.env.local");

    println!("cargo:rerun-if-env-changed=STOREHUB_URL");
    println!("cargo:rerun-if-env-changed=NEXT_PUBLIC_SITE_URL");

    for var in ["STOREHUB_URL", "NEXT_PUBLIC_SITE_URL"] {
        if let Ok(value) = std::env::var(var) {
            let value = value.trim();
            if !value.is_empty() {
                println!("cargo:rustc-env={var}={value}");
            }
        }
    }

    tauri_build::build()
}
