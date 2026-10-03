fn main() {
    println!("cargo:rerun-if-env-changed=TF21_SITE");
    tauri_build::build()
}
