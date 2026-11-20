use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const MANIFEST_JSON: &str = include_str!("../../resources/runtime_manifest.json");

#[derive(Clone, Deserialize)]
struct RuntimePackage {
    url: String,
    sha256: String,
    size_bytes: u64,
}

#[derive(Clone, Deserialize)]
struct RuntimePackages {
    core: RuntimePackage,
    nvidia: RuntimePackage,
}

#[derive(Clone, Deserialize)]
struct RuntimeManifest {
    schema_version: u32,
    runtime_version: String,
    packages: RuntimePackages,
}

#[derive(Default)]
pub struct RuntimeInstallState {
    pub installing: bool,
    pub cancel: Option<Arc<AtomicBool>>,
}

#[derive(Clone)]
pub struct ResolvedSidecar {
    pub program: PathBuf,
    pub args: Vec<String>,
    pub accelerator_dir: Option<PathBuf>,
    pub source: String,
}

#[derive(Clone, Serialize)]
pub struct RuntimeStatus {
    pub ready: bool,
    pub core_installed: bool,
    pub nvidia_installed: bool,
    pub installing: bool,
    pub dev_runtime: bool,
    pub runtime_version: String,
    pub runtime_root: String,
    pub executable: String,
    pub core_size_bytes: u64,
    pub nvidia_size_bytes: u64,
}

#[derive(Clone, Serialize)]
struct RuntimeProgress {
    package: String,
    phase: String,
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: f64,
}

fn manifest() -> Result<RuntimeManifest, String> {
    let parsed: RuntimeManifest = serde_json::from_str(MANIFEST_JSON)
        .map_err(|err| format!("Некорректный runtime manifest: {err}"))?;
    if parsed.schema_version != 1 {
        return Err("Неподдерживаемая версия runtime manifest".to_string());
    }
    Ok(parsed)
}

pub fn runtime_root() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("VoxNote")
        .join("runtime")
}

fn portable_runtime_root() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join("runtime")))
}

fn core_dir(root: &Path, version: &str) -> PathBuf {
    root.join(format!("core-{version}"))
}

fn nvidia_dir(root: &Path, version: &str) -> PathBuf {
    root.join(format!("nvidia-{version}"))
}

fn core_executable(root: &Path, version: &str) -> PathBuf {
    core_dir(root, version).join("voxnote-sidecar.exe")
}

fn nvidia_runtime_valid(path: &Path) -> bool {
    [
        "cublas64_12.dll",
        "cublaslt64_12.dll",
        "cudnn64_9.dll",
        "cudnn_cnn64_9.dll",
        "cudnn_graph64_9.dll",
        "cudnn_ops64_9.dll",
        "nvrtc64_120_0.dll",
    ]
    .into_iter()
    .all(|name| path.join(name).is_file())
}

fn installed_resolution(root: &Path, version: &str, source: &str) -> Option<ResolvedSidecar> {
    let program = core_executable(root, version);
    if !program.is_file() {
        return None;
    }
    let accelerator = nvidia_dir(root, version);
    Some(ResolvedSidecar {
        program,
        args: vec![],
        accelerator_dir: nvidia_runtime_valid(&accelerator).then_some(accelerator),
        source: source.to_string(),
    })
}

pub fn resolve_sidecar_command() -> Option<ResolvedSidecar> {
    #[cfg(debug_assertions)]
    {
        let venv_python = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join(".venv")
            .join("Scripts")
            .join("python.exe");
        if venv_python.is_file() {
            return Some(ResolvedSidecar {
                program: venv_python,
                args: vec!["-m".to_string(), "voxnote.sidecar".to_string()],
                accelerator_dir: None,
                source: "development".to_string(),
            });
        }
    }

    let parsed = manifest().ok()?;
    if let Some(portable_root) = portable_runtime_root() {
        if let Some(resolved) =
            installed_resolution(&portable_root, &parsed.runtime_version, "portable")
        {
            return Some(resolved);
        }
    }
    if let Some(resolved) = installed_resolution(&runtime_root(), &parsed.runtime_version, "shared")
    {
        return Some(resolved);
    }

    // Compatibility with the old full portable layout.
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let candidates = [
                parent.join("voxnote-sidecar.exe"),
                parent.join("voxnote-sidecar").join("voxnote-sidecar.exe"),
                parent
                    .join("binaries")
                    .join("voxnote-sidecar")
                    .join("voxnote-sidecar.exe"),
            ];
            if let Some(program) = candidates.into_iter().find(|candidate| candidate.is_file()) {
                return Some(ResolvedSidecar {
                    program,
                    args: vec![],
                    accelerator_dir: None,
                    source: "legacy-portable".to_string(),
                });
            }
        }
    }
    None
}

pub fn get_status(install_state: &Arc<Mutex<RuntimeInstallState>>) -> RuntimeStatus {
    let parsed = manifest().expect("embedded runtime manifest must be valid");
    let shared_root = runtime_root();
    let portable_root = portable_runtime_root();
    let shared_core = core_executable(&shared_root, &parsed.runtime_version).is_file();
    let portable_core = portable_root
        .as_ref()
        .is_some_and(|root| core_executable(root, &parsed.runtime_version).is_file());
    let shared_nvidia = nvidia_runtime_valid(&nvidia_dir(&shared_root, &parsed.runtime_version));
    let portable_nvidia = portable_root
        .as_ref()
        .is_some_and(|root| nvidia_runtime_valid(&nvidia_dir(root, &parsed.runtime_version)));
    let resolved = resolve_sidecar_command();
    let installing = install_state
        .lock()
        .map(|state| state.installing)
        .unwrap_or(false);
    RuntimeStatus {
        ready: resolved.is_some(),
        core_installed: shared_core || portable_core || cfg!(debug_assertions),
        nvidia_installed: shared_nvidia || portable_nvidia,
        installing,
        dev_runtime: resolved
            .as_ref()
            .is_some_and(|value| value.source == "development"),
        runtime_version: parsed.runtime_version,
        runtime_root: shared_root.to_string_lossy().to_string(),
        executable: resolved
            .map(|value| value.program.to_string_lossy().to_string())
            .unwrap_or_default(),
        core_size_bytes: parsed.packages.core.size_bytes,
        nvidia_size_bytes: parsed.packages.nvidia.size_bytes,
    }
}

fn package_for(
    profile: &str,
    parsed: &RuntimeManifest,
) -> Result<Vec<(String, RuntimePackage)>, String> {
    match profile {
        "cpu" => Ok(vec![("core".to_string(), parsed.packages.core.clone())]),
        "nvidia" => Ok(vec![
            ("core".to_string(), parsed.packages.core.clone()),
            ("nvidia".to_string(), parsed.packages.nvidia.clone()),
        ]),
        _ => Err("Неизвестный профиль runtime. Выберите CPU или NVIDIA.".to_string()),
    }
}

fn valid_package(package: &RuntimePackage) -> bool {
    package.size_bytes > 0
        && package.sha256.len() == 64
        && package.sha256.chars().all(|ch| ch.is_ascii_hexdigit())
        && package
            .url
            .starts_with("https://github.com/wrldwideme/VoxNote/releases/download/")
}

fn target_dir(root: &Path, version: &str, package_name: &str) -> PathBuf {
    if package_name == "core" {
        core_dir(root, version)
    } else {
        nvidia_dir(root, version)
    }
}

fn emit_progress(app: &AppHandle, package: &str, phase: &str, received: u64, total: u64) {
    let percent = if total > 0 {
        (received as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let _ = app.emit(
        "runtime-install-progress",
        RuntimeProgress {
            package: package.to_string(),
            phase: phase.to_string(),
            downloaded_bytes: received,
            total_bytes: total,
            percent,
        },
    );
}

fn install_package(
    app: &AppHandle,
    client: &Client,
    root: &Path,
    version: &str,
    name: &str,
    package: &RuntimePackage,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let target = target_dir(root, version, name);
    if (name == "core" && target.join("voxnote-sidecar.exe").is_file())
        || (name == "nvidia" && nvidia_runtime_valid(&target))
    {
        return Ok(());
    }
    if !valid_package(package) {
        return Err("Runtime-пакеты ещё не опубликованы для этой версии приложения.".to_string());
    }

    fs::create_dir_all(root).map_err(|err| format!("Не удалось создать каталог runtime: {err}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_millis();
    let archive_path = root.join(format!(".{name}-{stamp}.download"));
    let staging = root.join(format!(".{name}-{stamp}.staging"));

    let result = (|| -> Result<(), String> {
        emit_progress(app, name, "downloading", 0, package.size_bytes);
        let mut response = client
            .get(&package.url)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|err| format!("Не удалось скачать {name}-runtime: {err}"))?;
        let total = response.content_length().unwrap_or(package.size_bytes);
        let mut output = File::create(&archive_path).map_err(|err| err.to_string())?;
        let mut hasher = Sha256::new();
        let mut received = 0_u64;
        let mut buffer = [0_u8; 256 * 1024];
        loop {
            if cancel.load(Ordering::Relaxed) {
                return Err("Установка runtime отменена пользователем.".to_string());
            }
            let read = response.read(&mut buffer).map_err(|err| err.to_string())?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|err| err.to_string())?;
            hasher.update(&buffer[..read]);
            received += read as u64;
            emit_progress(app, name, "downloading", received, total);
        }
        output.sync_all().map_err(|err| err.to_string())?;

        emit_progress(app, name, "verifying", received, total);
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(&package.sha256) {
            return Err(format!("Контрольная сумма {name}-runtime не совпала."));
        }

        fs::create_dir_all(&staging).map_err(|err| err.to_string())?;
        let archive_file = File::open(&archive_path).map_err(|err| err.to_string())?;
        let mut archive = zip::ZipArchive::new(archive_file).map_err(|err| err.to_string())?;
        let archive_len = archive.len();
        emit_progress(app, name, "extracting", 0, archive_len as u64);
        for index in 0..archive_len {
            if cancel.load(Ordering::Relaxed) {
                return Err("Установка runtime отменена пользователем.".to_string());
            }
            let mut item = archive.by_index(index).map_err(|err| err.to_string())?;
            let relative = item
                .enclosed_name()
                .ok_or_else(|| "Runtime-архив содержит небезопасный путь.".to_string())?;
            let destination = staging.join(relative);
            if item.is_dir() {
                fs::create_dir_all(&destination).map_err(|err| err.to_string())?;
            } else {
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
                }
                let mut destination_file =
                    File::create(&destination).map_err(|err| err.to_string())?;
                std::io::copy(&mut item, &mut destination_file).map_err(|err| err.to_string())?;
            }
            emit_progress(
                app,
                name,
                "extracting",
                (index + 1) as u64,
                archive_len as u64,
            );
        }

        if name == "core" && !staging.join("voxnote-sidecar.exe").is_file() {
            return Err("Core runtime не содержит voxnote-sidecar.exe.".to_string());
        }
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|err| err.to_string())?;
        }
        fs::rename(&staging, &target)
            .map_err(|err| format!("Не удалось активировать runtime: {err}"))?;
        emit_progress(app, name, "completed", 1, 1);
        Ok(())
    })();

    let _ = fs::remove_file(&archive_path);
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

pub fn install_profile(
    app: &AppHandle,
    profile: &str,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    let parsed = manifest()?;
    let packages = package_for(profile, &parsed)?;
    let client = Client::builder()
        .user_agent("VoxNote-Runtime-Installer/1")
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|err| err.to_string())?;
    let root = runtime_root();
    for (name, package) in packages {
        install_package(
            app,
            &client,
            &root,
            &parsed.runtime_version,
            &name,
            &package,
            &cancel,
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_manifest_is_valid_and_has_publishable_packages() {
        let parsed = manifest().expect("manifest must parse");

        assert_eq!(parsed.schema_version, 1);
        assert!(valid_package(&parsed.packages.core));
        assert!(valid_package(&parsed.packages.nvidia));
        assert!(parsed.packages.core.size_bytes > 0);
        assert!(parsed.packages.nvidia.size_bytes > parsed.packages.core.size_bytes);
    }

    #[test]
    fn cpu_profile_does_not_install_nvidia_pack() {
        let parsed = manifest().expect("manifest must parse");

        let packages = package_for("cpu", &parsed).expect("cpu profile must exist");

        assert_eq!(packages.len(), 1);
        assert_eq!(packages[0].0, "core");
    }

    #[test]
    fn nvidia_profile_installs_core_before_accelerator() {
        let parsed = manifest().expect("manifest must parse");

        let packages = package_for("nvidia", &parsed).expect("nvidia profile must exist");

        assert_eq!(packages.len(), 2);
        assert_eq!(packages[0].0, "core");
        assert_eq!(packages[1].0, "nvidia");
    }

    #[test]
    fn unknown_profile_is_rejected() {
        let parsed = manifest().expect("manifest must parse");

        assert!(package_for("automatic", &parsed).is_err());
    }

    #[test]
    fn package_url_must_be_https_and_point_to_project_releases() {
        let invalid = RuntimePackage {
            url: "http://example.test/runtime.zip".to_string(),
            sha256: "0".repeat(64),
            size_bytes: 1,
        };

        assert!(!valid_package(&invalid));
    }

    #[test]
    fn nvidia_runtime_requires_core_cuda_dlls() {
        let root = std::env::temp_dir().join(format!(
            "voxnote-runtime-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock must be valid")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("temporary runtime directory must be created");
        assert!(!nvidia_runtime_valid(&root));

        for name in [
            "cublas64_12.dll",
            "cublaslt64_12.dll",
            "cudnn64_9.dll",
            "cudnn_cnn64_9.dll",
            "cudnn_graph64_9.dll",
            "cudnn_ops64_9.dll",
            "nvrtc64_120_0.dll",
        ] {
            File::create(root.join(name)).expect("CUDA runtime marker must be created");
        }
        assert!(nvidia_runtime_valid(&root));

        fs::remove_dir_all(root).expect("temporary runtime directory must be removed");
    }
}
