import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceNote } from "./components/WorkspaceNote";
import { WorkspaceNew } from "./components/WorkspaceNew";
import { WorkspaceHome } from "./components/WorkspaceHome";
import { RightPanel } from "./components/RightPanel";
import { ModelManagerModal } from "./components/Modals/ModelManagerModal";
import { DictionaryModal } from "./components/Modals/DictionaryModal";
import { PrivacyModal } from "./components/Modals/PrivacyModal";
import { OnboardingModal } from "./components/Modals/OnboardingModal";
import { UpdateModal } from "./components/Modals/UpdateModal";
import { PreferencesModal } from "./components/Modals/PreferencesModal";
import { RuntimeSetup } from "./components/RuntimeSetup";
import { RuntimeInstallProgress, RuntimeStatus, sidecarClient } from "./api/client";
import {
  AudioMetadata,
  DictionaryOption,
  HistoryEntry,
  HistoryGroup,
  ModelOption,
  ThemeMode,
  TranscriptionProgress,
} from "./types/ipc";

type ProcessingPhase = "loading_model" | "transcribing" | "finalizing";

interface ProcessingRuntime {
  modelId: string;
  device: string;
  deviceLabel: string;
}

const formatModelLabel = (modelId: string) => {
  if (modelId === "small") return "Быстрая (small)";
  if (modelId === "turbo" || modelId === "large-v3-turbo") return "Сбалансированная (turbo)";
  if (modelId === "large-v3") return "Максимальная точность (large-v3)";
  return modelId;
};

const formatDeviceLabel = (device: string, fallback = "") => {
  if (device === "cuda") {
    if (!fallback || fallback.toLowerCase() === "cuda") return "Видеокарта NVIDIA (CUDA)";
    if (/видеокарта|cuda/i.test(fallback)) return fallback;
    return `Видеокарта: ${fallback} (CUDA)`;
  }
  if (device === "cpu") return "Процессор (CPU)";
  if (device === "auto") return "Автовыбор (GPU → CPU)";
  return fallback || device;
};

const isNewerVersion = (candidate: string, current: string) => {
  const parse = (value: string) =>
    value.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const candidateParts = parse(candidate);
  const currentParts = parse(current);
  const length = Math.max(candidateParts.length, currentParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (candidateParts[index] || 0) - (currentParts[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
};

export function App() {
  const appVersion = "0.2.1";
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialTheme = (searchParams?.get("theme") as ThemeMode) || "light";
  const initialView = (searchParams?.get("view") as "home" | "note" | "new") || "home";
  const initialModal = searchParams?.get("modal");

  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [activeWorkspace, setActiveWorkspace] = useState<"home" | "note" | "new">(initialView);
  const [activeLectureId, setActiveLectureId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [activeEntry, setActiveEntry] = useState<HistoryEntry | null>(null);

  // Configuration state
  const [models, setModels] = useState<ModelOption[]>([]);
  const [dictionaries, setDictionaries] = useState<DictionaryOption[]>([]);
  const [devicePreference, setDevicePreference] = useState<"auto" | "cuda" | "cpu">("auto");
  const [selectedModelName, setSelectedModelName] = useState("Быстрая");
  const [selectedDictName, setSelectedDictName] = useState("Без словаря");

  // Modals
  const [isModelsOpen, setIsModelsOpen] = useState(initialModal === "models");
  const [isDictsOpen, setIsDictsOpen] = useState(initialModal === "dict");
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(initialModal === "privacy");
  const [isUpdateOpen, setIsUpdateOpen] = useState(initialModal === "update");
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(
    initialModal === "onboarding" ||
      (typeof window !== "undefined" && !localStorage.getItem("voxnote_onboarding_seen"))
  );
  const [reduceMotion, setReduceMotion] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [runtimeChecked, setRuntimeChecked] = useState(false);
  const [runtimeInstallProgress, setRuntimeInstallProgress] = useState<RuntimeInstallProgress | null>(null);
  const [isInstallingNvidia, setIsInstallingNvidia] = useState(false);
  const [nvidiaInstallError, setNvidiaInstallError] = useState<string | null>(null);
  const runtimeBootstrappedRef = useRef(false);

  // New transcription state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(null);
  const [isInspectingAudio, setIsInspectingAudio] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [relinkError, setRelinkError] = useState<string | null>(null);
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>("loading_model");
  const [processingRuntime, setProcessingRuntime] = useState<ProcessingRuntime | null>(null);
  const [canRetryOnCpu, setCanRetryOnCpu] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const isProcessingRef = useRef(false);
  const isInspectingAudioRef = useRef(false);
  const isInstallingNvidiaRef = useRef(false);
  const allowNativeCloseRef = useRef(false);
  const closeAfterCancellationRef = useRef(false);

  // Model download state
  const [downloadProgress, setDownloadProgress] = useState<{
    model_id: string;
    percent: number;
    downloaded_bytes: number;
    total_bytes: number;
  } | null>(null);

  // Editing mode for note view
  const [isEditingMode, setIsEditingMode] = useState(true);

  // Autosave
  const [isAutosaved, setIsAutosaved] = useState(true);
  const debounceTimerRef = useRef<number | null>(null);
  const historyRequestRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const requestNativeClose = async () => {
    allowNativeCloseRef.current = true;
    if (typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__)) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      } catch {
        await sidecarClient.closeWindow();
      }
    } else {
      window.close();
    }
  };

  // The desktop shell can start without the heavy ML runtime. Check it before
  // issuing JSON-RPC calls so first launch remains a valid application state.
  useEffect(() => {
    sidecarClient
      .getRuntimeStatus()
      .then(setRuntimeStatus)
      .finally(() => setRuntimeChecked(true));
  }, []);

  useEffect(() => {
    if (!runtimeStatus?.ready || runtimeBootstrappedRef.current) return;
    let disposed = false;
    let retryTimer: number | null = null;
    const bootstrap = async () => {
      if (disposed) return;
      runtimeBootstrappedRef.current = true;
      try {
        const [, , , info] = await Promise.all([
          loadHistory(),
          loadModels(),
          loadDictionaries(),
          sidecarClient.getSystemInfo(),
        ]);
        if (disposed) return;
        if (!searchParams?.has("theme")) setTheme(info.theme);
        setReduceMotion(info.reduce_motion);
        setDevicePreference(info.device_preference);
      } catch {
        runtimeBootstrappedRef.current = false;
        if (!disposed) retryTimer = window.setTimeout(() => void bootstrap(), 500);
      }
    };
    const initialTimer = window.setTimeout(
      () => void bootstrap(),
      runtimeStatus.dev_runtime ? 0 : 150,
    );
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [runtimeStatus]);

  const handleRuntimeReady = useCallback((nextStatus: RuntimeStatus) => {
    runtimeBootstrappedRef.current = false;
    setRuntimeStatus(nextStatus);
  }, []);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    void Promise.all([
      sidecarClient.onRuntimeInstallProgress((nextProgress) => {
        if (!disposed) setRuntimeInstallProgress(nextProgress);
      }),
      sidecarClient.onRuntimeInstallFinished((nextStatus) => {
        if (disposed) return;
        setIsInstallingNvidia(false);
        setRuntimeInstallProgress(null);
        runtimeBootstrappedRef.current = false;
        setRuntimeStatus(nextStatus);
      }),
      sidecarClient.onRuntimeInstallFailed((err) => {
        if (disposed) return;
        setIsInstallingNvidia(false);
        setRuntimeInstallProgress(null);
        setNvidiaInstallError(err);
      }),
      sidecarClient.onSidecarStatusChanged((running) => {
        if (disposed || running || isInstallingNvidiaRef.current) return;
        runtimeBootstrappedRef.current = false;
        if (isProcessingRef.current) {
          setIsProcessing(false);
          setIsCancelling(false);
          setErrorText(
            "Локальное ядро завершило работу. Частичный результат сохранён и будет доступен после перезапуска VoxNote.",
          );
        }
      }),
    ]).then((listeners) => cleanups.push(...listeners));
    return () => {
      disposed = true;
      cleanups.forEach((c) => c());
    };
  }, []);

  const handleInstallNvidia = async () => {
    if (isProcessingRef.current || isInspectingAudioRef.current) return;
    setIsInstallingNvidia(true);
    setNvidiaInstallError(null);
    try {
      await sidecarClient.installRuntime("nvidia");
    } catch (err: any) {
      setIsInstallingNvidia(false);
      setNvidiaInstallError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancelInstallNvidia = async () => {
    try {
      await sidecarClient.cancelRuntimeInstall();
    } finally {
      setIsInstallingNvidia(false);
      setRuntimeInstallProgress(null);
    }
  };

  // Theme synchronization
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      document.documentElement.classList.toggle("dark", dark);
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduce-motion", String(reduceMotion));
  }, [reduceMotion]);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    isInspectingAudioRef.current = isInspectingAudio;
  }, [isInspectingAudio]);

  useEffect(() => {
    isInstallingNvidiaRef.current = isInstallingNvidia;
  }, [isInstallingNvidia]);

  useEffect(() => {
    const internals = (window as any).__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== "function") return;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      unlisten = await getCurrentWindow().onCloseRequested((event) => {
        if (allowNativeCloseRef.current || !isProcessingRef.current) return;
        event.preventDefault();
        setIsCloseConfirmOpen(true);
      });
    });
    return () => unlisten?.();
  }, []);

  // Check for updates on GitHub Releases
  useEffect(() => {
    fetch("https://api.github.com/repos/wrldwideme/VoxNote/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.tag_name) {
          const remoteVer = data.tag_name.replace(/^v/i, "").trim();
          if (remoteVer && isNewerVersion(remoteVer, appVersion)) {
            setIsUpdateAvailable(true);
          }
        }
      })
      .catch(() => {
        // Silent failure if offline or GitHub rate limit
      });
  }, []);

  // Register real IPC events from Python sidecar
  useEffect(() => {
    const unProg = sidecarClient.on("transcription_progress", (data: TranscriptionProgress) => {
      setProgress(data);
    });

    const unRuntime = sidecarClient.on("transcription_runtime_selected", (data: any) => {
      setProcessingRuntime({
        modelId: data.model_id,
        device: data.device,
        deviceLabel: formatDeviceLabel(data.device, data.device_label),
      });
    });

    const unState = sidecarClient.on("state_changed", (data: any) => {
      if (["loading_model", "transcribing", "finalizing"].includes(data.current)) {
        setProcessingPhase(data.current as ProcessingPhase);
      }
    });

    const unComp = sidecarClient.on("transcription_completed", (data: any) => {
      setIsProcessing(false);
      setIsCancelling(false);
      setProgress(null);
      loadHistory();
      if (data.history_entry && data.history_entry.id) {
        setActiveEntry(data.history_entry);
        setActiveLectureId(data.history_entry.id);
        setActiveWorkspace("note");
      }
      if (closeAfterCancellationRef.current) void requestNativeClose();
    });

    const unCanc = sidecarClient.on("transcription_cancelled", (data: any) => {
      setIsProcessing(false);
      setIsCancelling(false);
      setProgress(null);
      loadHistory();
      if (data.history_entry?.id) {
        setActiveEntry(data.history_entry);
        setActiveLectureId(data.history_entry.id);
        setActiveWorkspace("note");
      }
      if (closeAfterCancellationRef.current) void requestNativeClose();
    });

    const unErr = sidecarClient.on("transcription_error", (data: any) => {
      setIsProcessing(false);
      setIsCancelling(false);
      setErrorText(data.message || "Ошибка во время транскрибации");
      setCanRetryOnCpu(Boolean(data.recoverable_on_cpu));
      closeAfterCancellationRef.current = false;
    });

    const unAudio = sidecarClient.on("audio_inspected", (meta: AudioMetadata) => {
      setIsInspectingAudio(false);
      setAudioMetadata(meta);
      if (meta.file_size) setSelectedFileSize(meta.file_size);
      if (meta.file_name) setSelectedFileName(meta.file_name);
      if (meta.file_path) setSelectedFilePath(meta.file_path);
    });

    const unAudioFail = sidecarClient.on("audio_inspection_failed", (err: any) => {
      setIsInspectingAudio(false);
      setErrorText(`Ошибка чтения аудиофайла: ${err.error || "Неподдерживаемый формат"}`);
    });

    const unModProg = sidecarClient.on("model_download_progress", (data: any) => {
      setDownloadProgress(data);
    });

    const unModDone = sidecarClient.on("model_download_finished", () => {
      setDownloadProgress(null);
      loadModels();
    });

    const unModFail = sidecarClient.on("model_download_failed", (err: any) => {
      setDownloadProgress(null);
      alert(`Ошибка загрузки модели: ${err.error || "Сетевая ошибка"}`);
    });

    const unModCanc = sidecarClient.on("model_download_cancelled", () => {
      setDownloadProgress(null);
    });

    return () => {
      unProg();
      unRuntime();
      unState();
      unComp();
      unCanc();
      unErr();
      unAudio();
      unAudioFail();
      unModProg();
      unModDone();
      unModFail();
      unModCanc();
    };
  }, []);

  // Keyboard shortcuts (Ctrl+K: Search, Ctrl+N: New Note)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (
          !isProcessingRef.current &&
          !isInspectingAudioRef.current &&
          !isInstallingNvidiaRef.current
        ) {
          handleNewFile();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadHistory = async (query = "") => {
    const requestId = ++historyRequestRef.current;
    const res = await sidecarClient.getHistory(query);
    if (requestId !== historyRequestRef.current) return;
    setHistoryGroups(res.groups);
    if (activeWorkspace === "note" && !activeEntry && res.entries.length > 0) {
      setActiveEntry(res.entries[0]);
      setActiveLectureId(res.entries[0].id);
    }
  };

  const loadModels = async () => {
    const m = await sidecarClient.getModels();
    setModels(m);
    const selected = m.find((x) => x.selected);
    if (selected) setSelectedModelName(selected.name);
  };

  const loadDictionaries = async () => {
    const d = await sidecarClient.getDictionaries();
    setDictionaries(d);
    const selected = d.find((x) => x.selected);
    if (selected) setSelectedDictName(selected.name);
  };

  const handleSelectLecture = async (id: string) => {
    if (isProcessing || isInspectingAudio || isInstallingNvidia) return;
    const entry = await sidecarClient.getHistoryEntry(id);
    if (entry) {
      setActiveEntry(entry);
      setActiveLectureId(entry.id);
      setActiveWorkspace("note");
      setRelinkError(null);
    }
  };

  const handleNewFile = () => {
    if (isProcessing || isInspectingAudio || isInstallingNvidia) return;
    setActiveWorkspace("new");
    setActiveEntry(null);
    setActiveLectureId("");
    setSelectedFilePath(null);
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setAudioMetadata(null);
    setIsInspectingAudio(false);
    setIsProcessing(false);
    setIsCancelling(false);
    setProgress(null);
    setProcessingRuntime(null);
    setProcessingPhase("loading_model");
    setErrorText(null);
    setCanRetryOnCpu(false);
  };

  const handleOpenHome = () => {
    if (isProcessing || isInspectingAudio) return;
    setActiveWorkspace("home");
    setActiveEntry(null);
    setActiveLectureId("");
    setSelectedFilePath(null);
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setAudioMetadata(null);
    setProgress(null);
    setProcessingRuntime(null);
    setErrorText(null);
    setSearchQuery("");
    void loadHistory("");
  };

  const handleUpdateNoteText = (newText: string) => {
    if (!activeEntry) return;
    setActiveEntry({ ...activeEntry, current_text: newText, has_edits: true });
    setIsAutosaved(false);

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(async () => {
      try {
        const updated = await sidecarClient.updateHistoryEntry(activeEntry.id, undefined, newText);
        if (updated) {
          setActiveEntry((current) => {
            if (!current || current.id !== updated.id) return current;
            // Do not overwrite characters typed while the save request was in flight.
            return current.current_text === newText
              ? updated
              : { ...current, revisions: updated.revisions };
          });
        }
        setIsAutosaved(true);
        loadHistory(searchQuery);
      } catch {
        // Ignore background autosave errors
      }
    }, 600);
  };

  const handleUpdateNoteTitle = async (newTitle: string) => {
    if (!activeEntry) return;
    const updated = await sidecarClient.updateHistoryEntry(activeEntry.id, newTitle);
    setActiveEntry(updated);
    loadHistory(searchQuery);
  };

  const handleDeleteEntry = async (id: string) => {
    if (isProcessing || isInspectingAudio || isInstallingNvidia) return;
    try {
      await sidecarClient.removeHistoryEntry(id);
      if (activeEntry?.id === id) {
        setActiveEntry(null);
        setActiveLectureId("");
        setActiveWorkspace("home");
      }
      await loadHistory(searchQuery);
    } catch (err: any) {
      alert(`Ошибка удаления записи: ${err.message || err}`);
    }
  };

  const handleCopyText = async () => {
    if (!activeEntry) return;
    await navigator.clipboard.writeText(activeEntry.current_text);
  };

  const handleExportText = async (format: "txt" | "markdown") => {
    if (!activeEntry) return;
    const extension = format === "txt" ? ".txt" : ".md";
    const filename = `${activeEntry.display_title.replace(/[\/\\:*?"<>|]/g, "_")}${extension}`;
    const blob = new Blob([activeEntry.current_text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    void sidecarClient.updateSettings({ theme: next });
  };

  const handleThemePreference = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    void sidecarClient.updateSettings({ theme: nextTheme });
  };

  const handleReduceMotionPreference = (enabled: boolean) => {
    setReduceMotion(enabled);
    void sidecarClient.updateSettings({ reduce_motion: enabled });
  };

  const handleToggleDevice = () => {
    const devices: ("auto" | "cuda" | "cpu")[] = ["auto", "cuda", "cpu"];
    const nextIdx = (devices.indexOf(devicePreference) + 1) % devices.length;
    setDevicePreference(devices[nextIdx]);
  };

  const handleFileSelected = (fileOrPath: File | string) => {
    setErrorText(null);
    if (typeof fileOrPath === "string") {
      const path = fileOrPath;
      const name = path.split(/[/\\]/).pop() || path;
      setIsInspectingAudio(true);
      setSelectedFilePath(path);
      setSelectedFileName(name);
      sidecarClient.inspectAudio(path).catch((err: any) => {
        setIsInspectingAudio(false);
        setErrorText(`Ошибка чтения файла: ${err.message || err}`);
      });
    } else {
      const fullPath = (fileOrPath as any).path || null;
      setSelectedFileName(fileOrPath.name);
      setSelectedFileSize(fileOrPath.size);
      if (fullPath) {
        setIsInspectingAudio(true);
        setSelectedFilePath(fullPath);
        sidecarClient.inspectAudio(fullPath).catch((err: any) => {
          setIsInspectingAudio(false);
          setErrorText(`Ошибка чтения файла: ${err.message || err}`);
        });
      } else {
        // Preview mode fallback
        setIsInspectingAudio(false);
        setSelectedFilePath(null);
        setAudioMetadata({
          file_path: fileOrPath.name,
          file_name: fileOrPath.name,
          file_size: fileOrPath.size,
          duration_seconds: 180,
          waveform: [15, 22, 35, 18, 42, 28, 50, 24, 38, 30, 20, 40, 26, 32, 22, 45, 28, 20, 48, 30],
        });
      }
    }
  };

  const startTranscription = async (
    deviceOverride?: "auto" | "cuda" | "cpu"
  ) => {
    if (isInspectingAudio || isInstallingNvidia) return;
    if (!selectedFilePath) {
      const picked = await sidecarClient.pickAudioFile();
      if (picked) {
        handleFileSelected(picked);
        return;
      }
      setErrorText("Пожалуйста, выберите аудиозапись для расшифровки.");
      return;
    }

    const currentModelObj = models.find((m) => m.selected) || models[0];
    if (currentModelObj && !currentModelObj.installed) {
      setErrorText(`Модель "${currentModelObj.name}" еще не установлена. Нажмите "Загрузить" в каталоге моделей.`);
      setIsModelsOpen(true);
      return;
    }

    setIsProcessing(true);
    setIsCancelling(false);
    setErrorText(null);
    setCanRetryOnCpu(false);
    setProgress(null);
    setProcessingPhase("loading_model");
    setProcessingRuntime({
      modelId: currentModelObj?.model_id || "small",
      device: deviceOverride ?? devicePreference,
      deviceLabel: formatDeviceLabel(deviceOverride ?? devicePreference),
    });

    try {
      const modelId = currentModelObj ? currentModelObj.model_id : undefined;
      const dictId = dictionaries.find((d) => d.selected)?.id;
      await sidecarClient.startTranscription(
        selectedFilePath,
        modelId,
        deviceOverride ?? devicePreference,
        dictId
      );
    } catch (err: any) {
      setIsProcessing(false);
      const message = err.message || "Не удалось запустить транскрибацию.";
      setErrorText(message);
      setCanRetryOnCpu(
        (deviceOverride ?? devicePreference) !== "cpu" &&
          /cuda|gpu|видеопамят|nvidia/i.test(message),
      );
    }
  };

  const handleStartTranscription = () => {
    void startTranscription();
  };

  const handleCancelTranscription = async () => {
    setIsCancelling(true);
    try {
      const result = await sidecarClient.cancelTranscription();
      if (result.status === "not_running") {
        setIsProcessing(false);
        setIsCancelling(false);
      }
    } catch (e) {
      console.warn("Cancel transcription error:", e);
      setIsCancelling(false);
    }
  };

  const handleStopAndClose = async () => {
    setIsCloseConfirmOpen(false);
    closeAfterCancellationRef.current = true;
    setIsCancelling(true);
    try {
      const result = await sidecarClient.cancelTranscription();
      if (result.status === "not_running") await requestNativeClose();
    } catch (err: any) {
      closeAfterCancellationRef.current = false;
      setIsCancelling(false);
      setErrorText(err.message || "Не удалось безопасно остановить транскрибацию.");
    }
  };

  const handleResumeTranscription = async (entry: HistoryEntry) => {
    if (!entry.file_path || !entry.file_available) {
      setErrorText("Исходный аудиофайл не найден. Сначала укажите его новое расположение.");
      return;
    }
    setSelectedFilePath(entry.file_path);
    setSelectedFileName(entry.file_name);
    setSelectedFileSize(null);
    setAudioMetadata(null);
    setActiveWorkspace("new");
    setIsProcessing(true);
    setIsCancelling(false);
    setErrorText(null);
    setProgress(null);
    setProcessingPhase("loading_model");
    setProcessingRuntime({
      modelId: entry.model_id,
      device: entry.device,
      deviceLabel: formatDeviceLabel(entry.device),
    });
    try {
      await sidecarClient.resumeTranscription(entry.id);
    } catch (err: any) {
      setIsProcessing(false);
      setErrorText(err.message || "Не удалось продолжить транскрибацию.");
    }
  };

  const handleRelinkAudio = async (entry: HistoryEntry) => {
    try {
      setRelinkError(null);
      const path = await sidecarClient.pickAudioFile();
      if (!path) return;
      const updated = await sidecarClient.relinkHistoryAudio(entry.id, path);
      setActiveEntry(updated);
      await loadHistory(searchQuery);
    } catch (err: any) {
      setRelinkError(err.message || "Не удалось привязать аудиофайл.");
    }
  };

  const handleDownloadModel = async (modelId: string) => {
    try {
      await sidecarClient.downloadModel(modelId);
    } catch (err: any) {
      alert(`Ошибка загрузки модели: ${err.message || err}`);
    }
  };

  const handleCancelDownload = async (modelId: string) => {
    try {
      await sidecarClient.cancelDownload(modelId);
    } catch (err: any) {
      console.warn(err);
    }
    setDownloadProgress(null);
  };

  const handleRemoveModel = async (modelId: string) => {
    if (!confirm("Удалить модель из памяти?")) return;
    try {
      await sidecarClient.removeModel(modelId);
      await loadModels();
    } catch (err: any) {
      alert(`Ошибка удаления модели: ${err.message || err}`);
    }
  };

  const handleImportCustomDictionary = async (fileOrPath: File | string) => {
    try {
      let path = typeof fileOrPath === "string" ? fileOrPath : (fileOrPath as any).path;
      if (!path) {
        path = await sidecarClient.pickDictionaryFile();
      }
      if (path) {
        const res = await sidecarClient.importCustomDictionary(path);
        alert(`Словарь успешно импортирован! Загружено терминов: ${res.term_count}`);
        await loadDictionaries();
      }
    } catch (err: any) {
      alert(`Ошибка импорта словаря: ${err.message || err}`);
    }
  };

  const handleRemoveCustomDictionary = async () => {
    if (!confirm("Удалить пользовательский словарь?")) return;
    try {
      await sidecarClient.removeCustomDictionary();
      await loadDictionaries();
    } catch (err: any) {
      alert(`Ошибка удаления словаря: ${err.message || err}`);
    }
  };

  const isRecordContext = activeWorkspace === "note" && activeEntry !== null;
  const isTopBarLocked = isRecordContext || isProcessing || isInspectingAudio;
  const topBarModelName = isRecordContext
    ? formatModelLabel(activeEntry.model_id)
    : isProcessing && processingRuntime
      ? formatModelLabel(processingRuntime.modelId)
      : selectedModelName;
  const topBarDeviceLabel = isRecordContext
    ? formatDeviceLabel(activeEntry.device)
    : isProcessing && processingRuntime
      ? processingRuntime.deviceLabel
      : undefined;
  const topBarDictionaryName = isRecordContext
    ? activeEntry.dictionary_id === "medical-ru"
      ? "Медицинский"
      : activeEntry.dictionary_id || "Без словаря"
    : selectedDictName;
  const allHistoryEntries = historyGroups.flatMap((group) => group.entries);
  const showRightPanel =
    (activeWorkspace === "note" && activeEntry !== null) ||
    (activeWorkspace === "new" && selectedFilePath !== null);

  if (!runtimeChecked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-brand-background text-sm font-medium text-brand-text-secondary dark:bg-dark-background dark:text-dark-text-secondary">
        Проверяем локальный движок…
      </div>
    );
  }

  if (runtimeStatus && !runtimeStatus.ready) {
    return <RuntimeSetup status={runtimeStatus} onReady={handleRuntimeReady} />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-brand-background dark:bg-dark-background text-brand-text dark:text-dark-text font-sans antialiased">
      {/* 1. Left Column: Full-Height Sidebar (Concept A) */}
      <Sidebar
        groups={historyGroups}
        activeId={activeLectureId}
        searchQuery={searchQuery}
        isNewActive={activeWorkspace === "new"}
        isHomeActive={activeWorkspace === "home"}
        homeDisabled={isProcessing || isInspectingAudio}
        actionsDisabled={isProcessing || isInspectingAudio || isInstallingNvidia}
        onSearchChange={(q) => {
          if (isProcessing || isInspectingAudio || isInstallingNvidia) return;
          setSearchQuery(q);
          loadHistory(q);
        }}
        onSelectLecture={handleSelectLecture}
        onNewFile={handleNewFile}
        onOpenHome={handleOpenHome}
        onOpenSettings={() => {
          if (!isProcessing && !isInspectingAudio && !isInstallingNvidia) {
            setIsPreferencesOpen(true);
          }
        }}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onDeleteEntry={handleDeleteEntry}
        onOpenUpdates={() => {
          if (!isProcessing && !isInspectingAudio && !isInstallingNvidia) {
            setIsUpdateOpen(true);
          }
        }}
        isUpdateAvailable={isUpdateAvailable}
        searchInputRef={searchInputRef}
      />

      {/* 2. Main Right Area: TopBar + Workspace & Right Panel */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* TopBar Header (Concept A) */}
        <TopBar
          modelName={topBarModelName}
          devicePreference={devicePreference}
          deviceLabel={topBarDeviceLabel}
          dictionaryName={topBarDictionaryName}
          controlsLocked={isTopBarLocked}
          contextLabel={isRecordContext ? "Параметры этой записи" : "Идёт обработка"}
          theme={theme}
          onOpenModels={() => setIsModelsOpen(true)}
          onOpenDictionaries={() => setIsDictsOpen(true)}
          onToggleDevice={handleToggleDevice}
          onToggleTheme={handleToggleTheme}
          onOpenPrivacyInfo={() => setIsPrivacyOpen(true)}
        />

        {/* Workspace Note or New Transcription + Right Actions & Timeline */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {/* Center Column: Focused Workspace (Note or New Transcription) */}
          {activeWorkspace === "home" ? (
            <WorkspaceHome
              entries={allHistoryEntries}
              onNewFile={handleNewFile}
              onOpenEntry={handleSelectLecture}
            />
          ) : activeWorkspace === "note" && activeEntry ? (
            <WorkspaceNote
              entry={activeEntry}
              isEditingMode={isEditingMode}
              onUpdateText={handleUpdateNoteText}
              onUpdateTitle={handleUpdateNoteTitle}
              onDeleteEntry={handleDeleteEntry}
              onResumeTranscription={handleResumeTranscription}
              onClose={handleOpenHome}
              onRelinkAudio={handleRelinkAudio}
              relinkError={relinkError}
            />
          ) : (
            <WorkspaceNew
              selectedFilePath={selectedFilePath}
              selectedFileName={selectedFileName}
              selectedFileSize={selectedFileSize}
              audioMetadata={audioMetadata}
              isInspectingAudio={isInspectingAudio}
              isProcessing={isProcessing}
              isCancelling={isCancelling}
              progress={progress}
              processingPhase={processingPhase}
              processingModelLabel={
                processingRuntime ? formatModelLabel(processingRuntime.modelId) : selectedModelName
              }
              processingDeviceLabel={
                processingRuntime?.deviceLabel || formatDeviceLabel(devicePreference)
              }
              error={errorText}
              canRetryOnCpu={canRetryOnCpu}
              onFileSelected={handleFileSelected}
              onStartTranscription={handleStartTranscription}
              onCancelTranscription={handleCancelTranscription}
              onRetryOnCpu={() => {
                setDevicePreference("cpu");
                void startTranscription("cpu");
              }}
            />
          )}

          {/* Right Column: Actions, Timeline & Audio Player (Concept A) */}
          {showRightPanel && (
            <RightPanel
              segments={activeEntry?.segments || []}
              durationFormatted={
                activeEntry?.duration_formatted ||
                (audioMetadata?.duration_seconds
                  ? `${Math.floor(audioMetadata.duration_seconds / 60)}:${Math.floor(audioMetadata.duration_seconds % 60).toString().padStart(2, "0")}`
                  : "00:00")
              }
              audioPath={activeEntry?.file_path || selectedFilePath || undefined}
              waveform={activeEntry?.waveform || audioMetadata?.waveform || undefined}
              onCopyText={handleCopyText}
              onExportText={handleExportText}
              isAutosaved={isAutosaved}
              isEditingMode={isEditingMode}
              onToggleEditingMode={setIsEditingMode}
              hasTranscript={activeEntry !== null}
              audioAvailable={activeEntry?.file_available ?? true}
              onRelinkAudio={activeEntry ? () => void handleRelinkAudio(activeEntry) : undefined}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <ModelManagerModal
        isOpen={isModelsOpen}
        onClose={() => setIsModelsOpen(false)}
        models={models}
        onSelectModel={async (id) => {
          await sidecarClient.selectModel(id);
          await loadModels();
        }}
        onDownloadModel={handleDownloadModel}
        onRemoveModel={handleRemoveModel}
        downloadProgress={downloadProgress}
        onCancelDownload={handleCancelDownload}
      />

      <DictionaryModal
        isOpen={isDictsOpen}
        onClose={() => setIsDictsOpen(false)}
        dictionaries={dictionaries}
        onSelectDictionary={async (id) => {
          await sidecarClient.selectDictionary(id);
          await loadDictionaries();
        }}
        onImportCustomDictionary={handleImportCustomDictionary}
        onRemoveCustomDictionary={handleRemoveCustomDictionary}
      />

      <PrivacyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => {
          setIsOnboardingOpen(false);
          if (typeof window !== "undefined") {
            localStorage.setItem("voxnote_onboarding_seen", "true");
          }
        }}
      />

      <UpdateModal
        isOpen={isUpdateOpen}
        onClose={() => setIsUpdateOpen(false)}
        currentVersion={appVersion}
      />

      <PreferencesModal
        isOpen={isPreferencesOpen}
        onClose={() => setIsPreferencesOpen(false)}
        theme={theme}
        reduceMotion={reduceMotion}
        runtimeStatus={runtimeStatus}
        onInstallNvidia={handleInstallNvidia}
        onCancelInstallNvidia={handleCancelInstallNvidia}
        isInstallingNvidia={isInstallingNvidia}
        installProgress={runtimeInstallProgress}
        installError={nvidiaInstallError}
        onChangeTheme={handleThemePreference}
        onChangeReduceMotion={handleReduceMotionPreference}
        onOpenModels={() => {
          setIsPreferencesOpen(false);
          setIsModelsOpen(true);
        }}
        onOpenDictionaries={() => {
          setIsPreferencesOpen(false);
          setIsDictsOpen(true);
        }}
      />

      {isCloseConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="close-confirm-title">
          <div className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-surface p-5 shadow-card dark:border-dark-border dark:bg-dark-surface">
            <h2 id="close-confirm-title" className="text-base font-bold">Транскрибация ещё выполняется</h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-text-secondary dark:text-dark-text-secondary">
              Остановить обработку, сохранить уже распознанный текст и закрыть VoxNote?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsCloseConfirmOpen(false)} className="rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold hover:bg-black/5 dark:border-dark-border dark:hover:bg-white/5">
                Остаться
              </button>
              <button type="button" onClick={() => void handleStopAndClose()} className="rounded-lg bg-brand-danger px-3 py-2 text-xs font-semibold text-white hover:opacity-90">
                Остановить и закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
