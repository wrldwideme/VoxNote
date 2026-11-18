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
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialTheme = (searchParams?.get("theme") as ThemeMode) || "light";
  const initialView = (searchParams?.get("view") as "note" | "new") || "note";
  const initialModal = searchParams?.get("modal");
  const hasMockFile = searchParams?.get("withFile") === "true";
  const isMockProcessing = searchParams?.get("processing") === "true";

  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [activeWorkspace, setActiveWorkspace] = useState<"note" | "new">(initialView);
  const [activeLectureId, setActiveLectureId] = useState<string>("lecture-1");
  const [searchQuery, setSearchQuery] = useState("");
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>([]);
  const [activeEntry, setActiveEntry] = useState<HistoryEntry | null>(null);

  // Configuration state
  const [models, setModels] = useState<ModelOption[]>([]);
  const [dictionaries, setDictionaries] = useState<DictionaryOption[]>([]);
  const [devicePreference, setDevicePreference] = useState<"auto" | "cuda" | "cpu">("auto");
  const [selectedModelName, setSelectedModelName] = useState("Максимальная точность");
  const [selectedDictName, setSelectedDictName] = useState("Медицинская лекция");

  // Modals
  const [isModelsOpen, setIsModelsOpen] = useState(initialModal === "models");
  const [isDictsOpen, setIsDictsOpen] = useState(initialModal === "dict");
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(initialModal === "privacy");
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(
    initialModal === "onboarding" ||
      (typeof window !== "undefined" && !localStorage.getItem("voxnote_onboarding_seen"))
  );

  // New transcription state
  const [selectedFile, setSelectedFile] = useState<File | null>(
    hasMockFile ? new File([""], "audio_2026-11-15_22-13-48.ogg", { type: "audio/ogg" }) : null
  );
  const [audioMetadata, setAudioMetadata] = useState<AudioMetadata | null>(
    hasMockFile
      ? {
          file_path: "audio_2026-11-15_22-13-48.ogg",
          file_name: "audio_2026-11-15_22-13-48.ogg",
          file_size: 1542000,
          duration_seconds: 102,
          waveform: [15, 22, 35, 18, 42, 28, 50, 24, 38, 30, 20, 40, 26, 32, 22, 45, 28, 20, 48, 30],
        }
      : null
  );
  const [isProcessing, setIsProcessing] = useState(isMockProcessing);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(
    isMockProcessing
      ? {
          processed_seconds: 45,
          total_seconds: 180,
          elapsed_seconds: 8,
          percent: 25,
          remaining_percent: 75,
          eta_seconds: 24,
          eta_formatted: "24 сек",
        }
      : null
  );
  const [errorText, setErrorText] = useState<string | null>(null);

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
    if (!activeEntry && res.entries.length > 0) {
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
    setSelectedFile(null);
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

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setErrorText(null);
    setAudioMetadata({
      file_path: file.name,
      file_name: file.name,
      file_size: file.size,
      duration_seconds: 180,
      waveform: [15, 22, 35, 18, 42, 28, 50, 24, 38, 30, 20, 40, 26, 32, 22, 45, 28, 20, 48, 30],
    });
  };

  const handleStartTranscription = () => {
    setIsProcessing(true);
    setProgress({
      processed_seconds: 0,
      total_seconds: 180,
      elapsed_seconds: 0,
      percent: 5,
      remaining_percent: 95,
      eta_seconds: 15,
      eta_formatted: "15 сек",
    });

    let currentPercent = 5;
    const interval = window.setInterval(() => {
      currentPercent += 15;
      if (currentPercent >= 100) {
        window.clearInterval(interval);
        setIsProcessing(false);
        setActiveWorkspace("note");
      } else {
        setProgress({
          processed_seconds: (currentPercent / 100) * 180,
          total_seconds: 180,
          elapsed_seconds: 2,
          percent: currentPercent,
          remaining_percent: 100 - currentPercent,
          eta_seconds: 10,
          eta_formatted: "10 сек",
        });
      }
    }, 400);
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
          onMinimizeWindow={() => console.log("Minimize")}
          onMaximizeWindow={() => console.log("Maximize")}
          onCloseWindow={() => console.log("Close")}
        />

        {/* Workspace Note or New Transcription + Right Actions & Timeline */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {/* Center Column: Focused Workspace (Note or New Transcription) */}
          {activeWorkspace === "note" && activeEntry ? (
            <WorkspaceNote
              entry={activeEntry}
              onUpdateText={handleUpdateNoteText}
              onUpdateTitle={handleUpdateNoteTitle}
            />
          ) : (
            <WorkspaceNew
              selectedFile={selectedFile}
              audioMetadata={audioMetadata}
              isProcessing={isProcessing}
              progress={progress}
              error={errorText}
              onFileSelected={handleFileSelected}
              onStartTranscription={handleStartTranscription}
              onCancelTranscription={() => setIsProcessing(false)}
              onRetryOnCpu={() => {
                setDevicePreference("cpu");
                handleStartTranscription();
              }}
            />
          )}

          {/* Right Column: Actions, Timeline & Audio Player (Concept A) */}
          <RightPanel
            segments={activeEntry?.segments || []}
            durationFormatted={activeEntry?.duration_formatted || "42:03"}
            onCopyText={handleCopyText}
            onExportText={handleExportText}
            isAutosaved={isAutosaved}
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
        onDownloadModel={() => {}}
        onRemoveModel={() => {}}
      />

      <DictionaryModal
        isOpen={isDictsOpen}
        onClose={() => setIsDictsOpen(false)}
        dictionaries={dictionaries}
        onSelectDictionary={(id) => {
          sidecarClient.selectDictionary(id);
          loadDictionaries();
        }}
        onImportCustomDictionary={() => {}}
        onRemoveCustomDictionary={() => {}}
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
    </div>
  );
}

export default App;
