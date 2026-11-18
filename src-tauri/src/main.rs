#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, State, Window};

#[derive(Default)]
struct SidecarProcess {
    stdin: Option<ChildStdin>,
    child: Option<Child>,
    is_running: bool,
}

struct AppState {
    sidecar: Arc<Mutex<SidecarProcess>>,
}

#[derive(Serialize, Deserialize)]
struct SidecarStatus {
    running: bool,
    executable: String,
}

/// Find Python executable or packaged voxnote-sidecar.exe
fn resolve_sidecar_command() -> (PathBuf, Vec<String>) {
    // 1. Check if packaged binary voxnote-sidecar.exe exists in current or sub-directories
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let candidates = [
                parent.join("voxnote-sidecar.exe"),
                parent.join("voxnote-sidecar").join("voxnote-sidecar.exe"),
                parent.join("binaries").join("voxnote-sidecar.exe"),
                parent.join("binaries").join("voxnote-sidecar").join("voxnote-sidecar.exe"),
                parent.join("resources").join("voxnote-sidecar.exe"),
                parent.join("resources").join("binaries").join("voxnote-sidecar.exe"),
                parent.join("resources").join("binaries").join("voxnote-sidecar").join("voxnote-sidecar.exe"),
            ];
            for candidate in candidates {
                if candidate.exists() {
                    return (candidate, vec![]);
                }
            }
        }
    }

    // 2. Check virtual environment python in project root (.venv)
    let venv_python = PathBuf::from(".venv\\Scripts\\python.exe");
    if venv_python.exists() {
        return (venv_python, vec!["-m".to_string(), "voxnote.sidecar".to_string()]);
    }

    // 3. Fall back to standard python on PATH
    (PathBuf::from("python"), vec!["-m".to_string(), "voxnote.sidecar".to_string()])
}

fn spawn_sidecar(app_handle: AppHandle, state_arc: Arc<Mutex<SidecarProcess>>) {
    let (program, args) = resolve_sidecar_command();
    eprintln!("[VoxNote Rust Supervisor] Spawning sidecar: {:?} with args {:?}", program, args);

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.spawn() {
        Ok(mut child) => {
            let stdin = child.stdin.take();
            let stdout = child.stdout.take();
            let stderr = child.stderr.take();

            {
                let mut guard = state_arc.lock().unwrap();
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
                eprintln!("[VoxNote Rust Supervisor] Sidecar exited with status: {:?}", status);
                {
                    let mut guard = state_clone.lock().unwrap();
                    guard.is_running = false;
                    guard.stdin = None;
                }
                let _ = app_clone.emit("sidecar-status-changed", false);
            });
        }
        Err(err) => {
            eprintln!("[VoxNote Rust Supervisor] Failed to spawn sidecar: {}", err);
            let mut guard = state_arc.lock().unwrap();
            guard.is_running = false;
        }
    }
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
    let (program, _) = resolve_sidecar_command();
    Ok(SidecarStatus {
        running: guard.is_running,
        executable: program.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn pick_audio_file() -> Result<Option<String>, String> {
    let file = rfd::FileDialog::new()
        .set_title("Выберите аудиозапись для расшифровки")
        .add_filter("Аудиофайлы (*.m4a, *.mp3, *.wav, *.flac, *.ogg)", &["m4a", "mp3", "wav", "flac", "ogg"])
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
    let sidecar_for_setup = sidecar_state.clone();
    let sidecar_for_exit = sidecar_state.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState {
            sidecar: sidecar_state,
        })
        .invoke_handler(tauri::generate_handler![
            send_to_sidecar,
            get_sidecar_status,
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
                    let _ = writeln!(stdin, r#"{{"jsonrpc":"2.0","method":"shutdown","id":999999}}"#);
                    let _ = stdin.flush();
                }
                if let Some(ref mut child) = guard.child {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running VoxNote Tauri application");
}
