import { useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { WorkspaceNote } from "./components/WorkspaceNote";
import { WorkspaceNew } from "./components/WorkspaceNew";
import { RightPanel } from "./components/RightPanel";
import { ModelManagerModal } from "./components/Modals/ModelManagerModal";
import { DictionaryModal } from "./components/Modals/DictionaryModal";
import { PrivacyModal } from "./components/Modals/PrivacyModal";
import { OnboardingModal } from "./components/Modals/OnboardingModal";
import { UpdateModal } from "./components/Modals/UpdateModal";
import { sidecarClient } from "./api/client";
import {
  AudioMetadata,
  DictionaryOption,
  HistoryEntry,
  HistoryGroup,
  ModelOption,
  ThemeMode,
  TranscriptionProgress,
} from "./types/ipc";

export function App() {
  const appVersion = "0.1.2";
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialTheme = (searchParams?.get("theme") as ThemeMode) || "light";
  const initialView = (searchParams?.get("view") as "note" | "new") || "new";
  const initialModal = searchParams?.get("modal");

  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [activeWorkspace, setActiveWorkspace] = useState<"note" | "new">(initialView);
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
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(
    initialModal === "onboarding" ||
      (typeof window !== "undefined" && !localStorage.getItem("voxnote_onboarding_seen"))
  );

  // New transcription state
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileSize, setSelectedFileSize] = useState<number | null>(null);
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

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
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load initial data
  useEffect(() => {
    loadHistory();
    loadModels();
    loadDictionaries();
  }, []);

  // Theme synchronization
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Check for updates on GitHub Releases
  useEffect(() => {
    fetch("https://api.github.com/repos/wrldwideme/VoxNote/releases/latest", {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.tag_name) {
          const remoteVer = data.tag_name.replace(/^v/i, "").trim();
          if (remoteVer && remoteVer !== appVersion) {
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

    const unComp = sidecarClient.on("transcription_completed", (data: any) => {
      setIsProcessing(false);
      setProgress(null);
      loadHistory();
      if (data.history_entry && data.history_entry.id) {
        setActiveEntry(data.history_entry);
        setActiveLectureId(data.history_entry.id);
        setActiveWorkspace("note");
      }
    });

    const unCanc = sidecarClient.on("transcription_cancelled", () => {
      setIsProcessing(false);
      setProgress(null);
    });

    const unErr = sidecarClient.on("transcription_error", (data: any) => {
      setIsProcessing(false);
      setErrorText(data.message || "Ошибка во время транскрибации");
    });

    const unAudio = sidecarClient.on("audio_inspected", (meta: AudioMetadata) => {
      setAudioMetadata(meta);
      if (meta.file_size) setSelectedFileSize(meta.file_size);
      if (meta.file_name) setSelectedFileName(meta.file_name);
      if (meta.file_path) setSelectedFilePath(meta.file_path);
    });

    const unAudioFail = sidecarClient.on("audio_inspection_failed", (err: any) => {
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
        handleNewFile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadHistory = async (query = "") => {
    const res = await sidecarClient.getHistory(query);
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
    const entry = await sidecarClient.getHistoryEntry(id);
    if (entry) {
      setActiveEntry(entry);
      setActiveLectureId(entry.id);
      setActiveWorkspace("note");
    }
  };

  const handleNewFile = () => {
    setActiveWorkspace("new");
    setSelectedFilePath(null);
    setSelectedFileName(null);
    setSelectedFileSize(null);
    setAudioMetadata(null);
    setIsProcessing(false);
    setProgress(null);
    setErrorText(null);
  };

  const handleUpdateNoteText = (newText: string) => {
    if (!activeEntry) return;
    setActiveEntry({ ...activeEntry, current_text: newText, has_edits: true });
    setIsAutosaved(false);

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(async () => {
      await sidecarClient.updateHistoryEntry(activeEntry.id, undefined, newText);
      setIsAutosaved(true);
      loadHistory(searchQuery);
    }, 600);
  };

  const handleUpdateNoteTitle = async (newTitle: string) => {
    if (!activeEntry) return;
    const updated = await sidecarClient.updateHistoryEntry(activeEntry.id, newTitle);
    setActiveEntry(updated);
    loadHistory(searchQuery);
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      await sidecarClient.removeHistoryEntry(id);
      if (activeEntry?.id === id) {
        setActiveEntry(null);
        setActiveLectureId("");
        setActiveWorkspace("new");
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
    setTheme(theme === "dark" ? "light" : "dark");
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
      setSelectedFilePath(path);
      setSelectedFileName(name);
      sidecarClient.inspectAudio(path).catch((err: any) => {
        setErrorText(`Ошибка чтения файла: ${err.message || err}`);
      });
    } else {
      const fullPath = (fileOrPath as any).path || null;
      setSelectedFileName(fileOrPath.name);
      setSelectedFileSize(fileOrPath.size);
      if (fullPath) {
        setSelectedFilePath(fullPath);
        sidecarClient.inspectAudio(fullPath).catch((err: any) => {
          setErrorText(`Ошибка чтения файла: ${err.message || err}`);
        });
      } else {
        // Preview mode fallback
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

  const handleStartTranscription = async () => {
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
    setErrorText(null);
    setProgress(null);

    try {
      const modelId = currentModelObj ? currentModelObj.model_id : undefined;
      const dictId = dictionaries.find((d) => d.selected)?.id;
      await sidecarClient.startTranscription(
        selectedFilePath,
        modelId,
        devicePreference,
        dictId
      );
    } catch (err: any) {
      setIsProcessing(false);
      setErrorText(err.message || "Не удалось запустить транскрибацию.");
    }
  };

  const handleCancelTranscription = async () => {
    try {
      await sidecarClient.cancelTranscription();
    } catch (e) {
      console.warn("Cancel transcription error:", e);
    }
    setIsProcessing(false);
    setProgress(null);
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-brand-background dark:bg-dark-background text-brand-text dark:text-dark-text font-sans antialiased">
      {/* 1. Left Column: Full-Height Sidebar (Concept A) */}
      <Sidebar
        groups={historyGroups}
        activeId={activeLectureId}
        searchQuery={searchQuery}
        isNewActive={activeWorkspace === "new"}
        onSearchChange={(q) => {
          setSearchQuery(q);
          loadHistory(q);
        }}
        onSelectLecture={handleSelectLecture}
        onNewFile={handleNewFile}
        onOpenSettings={() => setIsModelsOpen(true)}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onDeleteEntry={handleDeleteEntry}
        onOpenUpdates={() => setIsUpdateOpen(true)}
        isUpdateAvailable={isUpdateAvailable}
        searchInputRef={searchInputRef}
      />

      {/* 2. Main Right Area: TopBar + Workspace & Right Panel */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* TopBar Header (Concept A) */}
        <TopBar
          modelName={selectedModelName}
          devicePreference={devicePreference}
          dictionaryName={selectedDictName}
          theme={theme}
          onOpenModels={() => setIsModelsOpen(true)}
          onOpenDictionaries={() => setIsDictsOpen(true)}
          onToggleDevice={handleToggleDevice}
          onToggleTheme={handleToggleTheme}
          onOpenPrivacyInfo={() => setIsPrivacyOpen(true)}
          onOpenUpdates={() => setIsUpdateOpen(true)}
          isUpdateAvailable={isUpdateAvailable}
          onMinimizeWindow={() => sidecarClient.minimizeWindow()}
          onMaximizeWindow={() => sidecarClient.maximizeWindow()}
          onCloseWindow={() => sidecarClient.closeWindow()}
        />

        {/* Workspace Note or New Transcription + Right Actions & Timeline */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {/* Center Column: Focused Workspace (Note or New Transcription) */}
          {activeWorkspace === "note" && activeEntry ? (
            <WorkspaceNote
              entry={activeEntry}
              isEditingMode={isEditingMode}
              onUpdateText={handleUpdateNoteText}
              onUpdateTitle={handleUpdateNoteTitle}
              onDeleteEntry={handleDeleteEntry}
            />
          ) : (
            <WorkspaceNew
              selectedFilePath={selectedFilePath}
              selectedFileName={selectedFileName}
              selectedFileSize={selectedFileSize}
              audioMetadata={audioMetadata}
              isProcessing={isProcessing}
              progress={progress}
              error={errorText}
              onFileSelected={handleFileSelected}
              onStartTranscription={handleStartTranscription}
              onCancelTranscription={handleCancelTranscription}
              onRetryOnCpu={() => {
                setDevicePreference("cpu");
                handleStartTranscription();
              }}
            />
          )}

          {/* Right Column: Actions, Timeline & Audio Player (Concept A) */}
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
          />
        </div>
      </div>

      {/* Modals */}
      <ModelManagerModal
        isOpen={isModelsOpen}
        onClose={() => setIsModelsOpen(false)}
        models={models}
        onSelectModel={(id) => {
          sidecarClient.selectModel(id);
          loadModels();
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
        onSelectDictionary={(id) => {
          sidecarClient.selectDictionary(id);
          loadDictionaries();
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
    </div>
  );
}

export default App;
