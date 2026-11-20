#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod runtime_manager;

use runtime_manager::{ResolvedSidecar, RuntimeInstallState, RuntimeStatus};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State, Window};

#[derive(Default)]
struct SidecarProcess {
    stdin: Option<ChildStdin>,
    child_pid: Option<u32>,
    is_running: bool,
}

struct AppState {
    sidecar: Arc<Mutex<SidecarProcess>>,
    runtime_install: Arc<Mutex<RuntimeInstallState>>,
}

#[derive(Serialize, Deserialize)]
struct SidecarStatus {
    running: bool,
    executable: String,
}

fn spawn_sidecar(app_handle: AppHandle, state_arc: Arc<Mutex<SidecarProcess>>) {
    if state_arc
        .lock()
        .map(|state| state.is_running)
        .unwrap_or(false)
    {
        return;
    }
    let Some(ResolvedSidecar {
        program,
        args,
        accelerator_dir,
        source,
    }) = runtime_manager::resolve_sidecar_command()
    else {
        eprintln!("[VoxNote Rust Supervisor] Runtime is not installed.");
        let _ = app_handle.emit("runtime-required", true);
        return;
    };
    eprintln!(
        "[VoxNote Rust Supervisor] Spawning sidecar from {source}: {:?}",
        program
    );

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if matches!(source.as_str(), "portable" | "shared") {
        cmd.env("VOXNOTE_PACKAGED_RUNTIME", "1");
        cmd.env(
            "VOXNOTE_NVIDIA_ACCELERATOR_AVAILABLE",
            if accelerator_dir.is_some() { "1" } else { "0" },
        );
    }
    if let Some(accelerator_dir) = accelerator_dir {
        let current_path = std::env::var_os("PATH").unwrap_or_default();
        let mut paths = vec![accelerator_dir.clone()];
        paths.extend(std::env::split_paths(&current_path));
        if let Ok(joined) = std::env::join_paths(paths) {
            cmd.env("PATH", joined);
        }
        cmd.env("VOXNOTE_ACCELERATOR_DIR", accelerator_dir);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(mut child) => {
            let pid = child.id();
            let stdin = child.stdin.take();
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            {
                let mut guard = state_arc.lock().unwrap();
                guard.child_pid = Some(pid);
                guard.stdin = stdin;
                guard.is_running = true;
            }

            // Reader thread for stdout (streams JSON-RPC lines to frontend)
            if let Some(stdout) = stdout {
                let app = app_handle.clone();
                thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        match line {
                            Ok(msg) => {
                                if !msg.trim().is_empty() {
                                    let _ = app.emit("sidecar-message", msg);
                                }
                            }
                            Err(_) => break,
                        }
                    }
                    eprintln!("[VoxNote Rust Supervisor] Sidecar stdout closed.");
                });
            }

            // Reader thread for stderr (logs or diagnostics)
            if let Some(stderr) = stderr {
                thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(err_line) = line {
                            eprintln!("[VoxNote Sidecar stderr] {}", err_line);
                        }
                    }
                });
            }

            // Watchdog thread waiting on child exit
            let state_clone = state_arc.clone();
            let app_clone = app_handle.clone();
            thread::spawn(move || {
                let status = child.wait();
                eprintln!(
                    "[VoxNote Rust Supervisor] Sidecar exited with status: {:?}",
                    status
                );
                let was_current = {
                    let mut guard = state_clone.lock().unwrap();
                    if guard.child_pid == Some(pid) {
                        guard.is_running = false;
                        guard.stdin = None;
                        guard.child_pid = None;
                        true
                    } else {
                        false
                    }
                };
                if was_current {
                    let _ = app_clone.emit("sidecar-status-changed", false);
                }
            });
        }
        Err(err) => {
            eprintln!("[VoxNote Rust Supervisor] Failed to spawn sidecar: {}", err);
            let mut guard = state_arc.lock().unwrap();
            guard.is_running = false;
        }
    }
}

fn restart_sidecar(app_handle: AppHandle, state_arc: Arc<Mutex<SidecarProcess>>) {
    let pid_to_kill = {
        let mut guard = state_arc.lock().unwrap();
        if let Some(ref mut stdin) = guard.stdin {
            let _ = writeln!(
                stdin,
                r#"{{"jsonrpc":"2.0","method":"shutdown","id":999999}}"#
            );
            let _ = stdin.flush();
        }
        guard.stdin = None;
        guard.child_pid
    };
    thread::sleep(std::time::Duration::from_millis(300));
    if let Some(pid) = pid_to_kill {
        #[cfg(windows)]
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }
    {
        let mut guard = state_arc.lock().unwrap();
        guard.is_running = false;
        guard.child_pid = None;
    }
    spawn_sidecar(app_handle, state_arc);
}

#[tauri::command]
fn send_to_sidecar(state: State<AppState>, message: String) -> Result<(), String> {
    let mut guard = state.sidecar.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut stdin) = guard.stdin {
        writeln!(stdin, "{}", message).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Sidecar process is not running or stdin is unavailable".to_string())
    }
}

#[tauri::command]
fn get_sidecar_status(state: State<AppState>) -> Result<SidecarStatus, String> {
    let guard = state.sidecar.lock().map_err(|e| e.to_string())?;
    let executable = runtime_manager::resolve_sidecar_command()
        .map(|resolved| resolved.program.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(SidecarStatus {
        running: guard.is_running,
        executable,
    })
}

#[tauri::command]
fn get_runtime_status(state: State<AppState>) -> Result<RuntimeStatus, String> {
    Ok(runtime_manager::get_status(&state.runtime_install))
}

#[tauri::command]
fn install_runtime(app: AppHandle, state: State<AppState>, profile: String) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut install = state
            .runtime_install
            .lock()
            .map_err(|err| err.to_string())?;
        if install.installing {
            return Err("Установка runtime уже выполняется.".to_string());
        }
        install.installing = true;
        install.cancel = Some(cancel.clone());
    }

    let runtime_state = state.runtime_install.clone();
    let sidecar_state = state.sidecar.clone();
    thread::spawn(move || {
        let result = runtime_manager::install_profile(&app, &profile, cancel);
        if let Ok(mut install) = runtime_state.lock() {
            install.installing = false;
            install.cancel = None;
        }
        match result {
            Ok(()) => {
                restart_sidecar(app.clone(), sidecar_state);
                let status = runtime_manager::get_status(&runtime_state);
                let _ = app.emit("runtime-install-finished", status);
            }
            Err(error) => {
                let _ = app.emit("runtime-install-failed", error);
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn cancel_runtime_install(state: State<AppState>) -> Result<(), String> {
    let install = state
        .runtime_install
        .lock()
        .map_err(|err| err.to_string())?;
    if let Some(cancel) = &install.cancel {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
fn pick_audio_file() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .set_title("Выберите аудиозапись для расшифровки")
        .add_filter(
            "Аудиофайлы (*.m4a, *.mp3, *.wav, *.flac, *.ogg)",
            &["m4a", "mp3", "wav", "flac", "ogg"],
        )
        .pick_file();
    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn pick_dictionary_file() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .set_title("Выберите файл словаря терминов (.txt)")
        .add_filter("Текстовые файлы (*.txt)", &["txt"])
        .pick_file();
    Ok(file.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn minimize_window(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn maximize_window(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn close_window(window: Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell().open(&url, None).map_err(|e| e.to_string())
}

fn main() {
    let sidecar_state = Arc::new(Mutex::new(SidecarProcess::default()));
    let runtime_install_state = Arc::new(Mutex::new(RuntimeInstallState::default()));
    let sidecar_for_setup = sidecar_state.clone();
    let sidecar_for_exit = sidecar_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            sidecar: sidecar_state,
            runtime_install: runtime_install_state,
        })
        .invoke_handler(tauri::generate_handler![
            send_to_sidecar,
            get_sidecar_status,
            get_runtime_status,
            install_runtime,
            cancel_runtime_install,
            pick_audio_file,
            pick_dictionary_file,
            minimize_window,
            maximize_window,
            close_window,
            open_external_url,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            spawn_sidecar(handle, sidecar_for_setup);
            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Terminate sidecar cleanly upon window destruction
                let mut guard = sidecar_for_exit.lock().unwrap();
                if let Some(ref mut stdin) = guard.stdin {
                    let _ = writeln!(
                        stdin,
                        r#"{{"jsonrpc":"2.0","method":"shutdown","id":999999}}"#
                    );
                    let _ = stdin.flush();
                }
                guard.stdin = None;
                #[cfg(windows)]
                if let Some(pid) = guard.child_pid.take() {
                    let _ = Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .output();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running VoxNote Tauri application");
}
