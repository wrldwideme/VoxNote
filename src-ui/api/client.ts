import {
  DictionaryOption,
  HistoryEntry,
  HistoryGroup,
  ModelOption,
  SystemInfo,
  ThemeMode,
  TranscriptSegment,
} from "../types/ipc";
import ipcContract from "../../resources/ipc_contract.json";

type EventCallback<T = any> = (data: T) => void;

interface MethodContract {
  required: string[];
  optional: string[];
}

interface IpcContract {
  version: number;
  methods: Record<string, MethodContract>;
  events: string[];
}

export interface RpcBridge {
  listen(onMessage: (message: string) => void): Promise<void>;
  send(message: string): Promise<void>;
}

export interface RuntimeStatus {
  ready: boolean;
  core_installed: boolean;
  nvidia_installed: boolean;
  installing: boolean;
  dev_runtime: boolean;
  runtime_version: string;
  runtime_root: string;
  executable: string;
  core_size_bytes: number;
  nvidia_size_bytes: number;
}

export interface RuntimeInstallProgress {
  package: "core" | "nvidia";
  phase: "downloading" | "verifying" | "extracting" | "completed";
  downloaded_bytes: number;
  total_bytes: number;
  percent: number;
}

const contract = ipcContract as IpcContract;

class TauriRpcBridge implements RpcBridge {
  public async listen(onMessage: (message: string) => void): Promise<void> {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<string>("sidecar-message", (event) => onMessage(event.payload));
  }

  public async send(message: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("send_to_sidecar", { message });
  }
}

function createDefaultBridge(): RpcBridge | null {
  const isTauri = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
  return isTauri ? new TauriRpcBridge() : null;
}

// Mock fallback data reflecting Concept A lecture notes
const initialSegments: TranscriptSegment[] = [
  { start: 0, end: 134, text: "Введение в клиническую фармакологию и обзор приложения GoodNotes." },
  { start: 134, end: 327, text: "Работа с PDF-учебниками, организация текстовых и рукописных конспектов." },
  { start: 327, end: 529, text: "Ограничения в переносе фрагментов конспекта и альтернативы: Pages и Word." },
  { start: 529, end: 720, text: "Фармакокинетика: механизмы всасывания и распределения препаратов." },
];

const mockLectures: HistoryEntry[] = [
  {
    id: "lecture-1",
    created_at: "Сегодня, 13:48",
    file_name: "Медицинская_лекция_фармакология.m4a",
    title: "Медицинская лекция",
    display_title: "Медицинская лекция",
    duration_seconds: 2523,
    duration_formatted: "42 мин",
    model_id: "large-v3",
    device: "NVIDIA GeForce RTX 4060",
    dictionary_id: "medical-ru",
    text: "Есть приложение GoodNotes. Оно очень удобное для учёбы: в нём можно хранить учебники в PDF-формате, искать по ним, писать рукописные конспекты, писать отдельно текстовые конспекты, но неудобно то, что если здесь делать текстовые конспекты, во-первых, страницы существуют отдельно друг от друга, то есть нет как в Word переключения на следующую страницу, и если ты захочешь исправить что-то, например, на первой текста, у тебя не получится продлить это и перенести на следующую, как единые истории. Во-вторых, здесь не получается вести и рукописный, и печатный конспект. Например, я всё-таки решила делать печатный конспект, и в процессе мне пришлось что-то подписать от руки. И если я вдруг в это же место захочу вставить какой-то другой текст, мои рукописные пометки останутся на этом листе, и нет никакой возможности их перенести вместе с тем куском конспекта, к которому они были предназначены. Плюс, если учебник скачан в формате PDF, текстовая расшифровка может работать некорректно. Альтернативы — Pages на Apple и Word как более универсальный инструмент.",
    preview: "Обзор приложения GoodNotes, его возможностей для учёбы и ведения конспектов. Рассматриваются ключевые сценарии: хранение учебников, рукописные и печатные конспекты, организация материалов и альтернативы.",
    edited_text: null,
    current_text: "Есть приложение GoodNotes. Оно очень удобное для учёбы: в нём можно хранить учебники в PDF-формате, искать по ним, писать рукописные конспекты, писать отдельно текстовые конспекты, но неудобно то, что если здесь делать текстовые конспекты, во-первых, страницы существуют отдельно друг от друга, то есть нет как в Word переключения на следующую страницу, и если ты захочешь исправить что-то, например, на первой текста, у тебя не получится продлить это и перенести на следующую, как единые истории. Во-вторых, здесь не получается вести и рукописный, и печатный конспект. Например, я всё-таки решила делать печатный конспект, и в процессе мне пришлось что-то подписать от руки. И если я вдруг в это же место захочу вставить какой-то другой текст, мои рукописные пометки останутся на этом листе, и нет никакой возможности их перенести вместе с тем куском конспекта, к которому они были предназначены. Плюс, если учебник скачан в формате PDF, текстовая расшифровка может работать некорректно. Альтернативы — Pages на Apple и Word как более универсальный инструмент.",
    has_edits: false,
    status: "completed",
    resume_from_seconds: 0,
    file_available: true,
    revisions: [],
    segments: initialSegments,
  },
  {
    id: "lecture-2",
    created_at: "12 нояб., 16:20",
    file_name: "Фармакология_основы.mp3",
    title: "Фармакология: основы",
    display_title: "Фармакология: основы",
    duration_seconds: 3480,
    duration_formatted: "58 мин",
    model_id: "turbo",
    device: "NVIDIA GeForce RTX 4060",
    dictionary_id: "medical-ru",
    text: "Основные понятия фармакокинетики и фармакодинамики. Пути введения лекарственных веществ, биодоступность и терапевтический индекс.",
    preview: "Основные понятия фармакокинетики и фармакодинамики. Пути введения лекарственных веществ, биодоступность...",
    edited_text: null,
    current_text: "Основные понятия фармакокинетики и фармакодинамики. Пути введения лекарственных веществ, биодоступность и терапевтический индекс.",
    has_edits: false,
    status: "completed",
    resume_from_seconds: 0,
    file_available: true,
    revisions: [],
    segments: [],
  },
  {
    id: "lecture-3",
    created_at: "11 нояб., 11:05",
    file_name: "Анатомия_сердце.wav",
    title: "Анатомия: сердечно-сосудистая",
    display_title: "Анатомия: сердечно-сосудистая",
    duration_seconds: 2820,
    duration_formatted: "47 мин",
    model_id: "turbo",
    device: "CPU",
    dictionary_id: "medical-ru",
    text: "Строение сердца, предсердия и желудочки. Проводящая система сердца: синусно-предсердный узел, атриовентрикулярный узел и пучок Гиса.",
    preview: "Строение сердца, предсердия и желудочки. Проводящая система сердца: синусно-предсердный узел...",
    edited_text: null,
    current_text: "Строение сердца, предсердия и желудочки. Проводящая система сердца: синусно-предсердный узел, атриовентрикулярный узел и пучок Гиса.",
    has_edits: false,
    status: "completed",
    resume_from_seconds: 0,
    file_available: true,
    revisions: [],
    segments: [],
  },
  {
    id: "lecture-4",
    created_at: "7 нояб., 14:30",
    file_name: "Клинические_случаи_кардио.ogg",
    title: "Клинические случаи",
    display_title: "Клинические случаи",
    duration_seconds: 2160,
    duration_formatted: "36 мин",
    model_id: "large-v3",
    device: "NVIDIA GeForce RTX 4060",
    dictionary_id: "medical-ru",
    text: "Разбор пациента с жалобами на боли за грудиной и одышку. Анализ данных ЭКГ и выбор антиаритмической терапии.",
    preview: "Разбор пациента с жалобами на боли за грудиной и одышку. Анализ данных ЭКГ и выбор антиаритмической терапии...",
    edited_text: null,
    current_text: "Разбор пациента с жалобами на боли за грудиной и одышку. Анализ данных ЭКГ и выбор антиаритмической терапии.",
    has_edits: false,
    status: "completed",
    resume_from_seconds: 0,
    file_available: true,
    revisions: [],
    segments: [],
  },
  {
    id: "lecture-5",
    created_at: "5 нояб., 10:12",
    file_name: "Патофизиология_гипоксия.m4a",
    title: "Патофизиология",
    display_title: "Патофизиология",
    duration_seconds: 3000,
    duration_formatted: "50 мин",
    model_id: "small",
    device: "CPU",
    dictionary_id: "medical-ru",
    text: "Классификация гипоксических состояний: дыхательная, циркуляторная, гемическая и тканевая гипоксия. Компенсаторные реакции организма.",
    preview: "Классификация гипоксических состояний: дыхательная, циркуляторная, гемическая и тканевая гипоксия...",
    edited_text: null,
    current_text: "Классификация гипоксических состояний: дыхательная, циркуляторная, гемическая и тканевая гипоксия. Компенсаторные реакции организма.",
    has_edits: false,
    status: "completed",
    resume_from_seconds: 0,
    file_available: true,
    revisions: [],
    segments: [],
  },
];

export class SidecarClient {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private mockHistory: HistoryEntry[] = [...mockLectures];
  private currentTheme: ThemeMode = "light";
  private reduceMotion = false;
  private currentDevice: "auto" | "cuda" | "cpu" = "auto";
  private currentModel = "large-v3";
  private currentDictionary = "medical-ru";

  // IPC Protocol state
  private nextRequestId = 1;
  private pendingRequests = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();
  private readonly isTauri: boolean;
  private tauriInitialized = false;
  private tauriInitialization: Promise<void> | null = null;

  constructor(private readonly bridge: RpcBridge | null = createDefaultBridge()) {
    this.isTauri = bridge !== null;
    if (this.isTauri) {
      void this.initTauriIpc().catch(() => {
        // The first real RPC call will retry initialization and surface the error.
      });
    }
  }

  private async initTauriIpc(): Promise<void> {
    if (this.tauriInitialized) return;
    if (!this.tauriInitialization) {
      this.tauriInitialization = (async () => {
        try {
          await this.bridge?.listen((message) => this.handleIncomingRawMessage(message));
          this.tauriInitialized = true;
        } catch (error) {
          console.warn("[SidecarClient] Tauri IPC initialization failed:", error);
          throw error;
        } finally {
          this.tauriInitialization = null;
        }
      })();
    }
    await this.tauriInitialization;
  }

  private handleIncomingRawMessage(rawPayload: string): void {
    try {
      const msg = JSON.parse(rawPayload);
      if ("id" in msg && msg.id != null) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error.message || "Sidecar JSON-RPC Error"));
          } else {
            pending.resolve(msg.result);
          }
        }
      } else if ("method" in msg && contract.events.includes(msg.method)) {
        // Streaming notification (e.g. transcription_progress, audio_inspected)
        this.emit(msg.method, msg.params);
      }
    } catch (err) {
      console.error("[SidecarClient] Failed to parse message from sidecar:", err, rawPayload);
    }
  }

  private async callRpc<T = any>(method: string, params: Record<string, any> = {}): Promise<T> {
    const normalizedParams = this.validateRpcCall(method, params);
    if (this.isTauri) {
      await this.initTauriIpc();
      const id = ++this.nextRequestId;
      const requestPayload = JSON.stringify({ jsonrpc: "2.0", id, method, params: normalizedParams });

      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error(`Sidecar request timeout for method '${method}'`));
          }
        }, 30000);

        this.pendingRequests.set(id, {
          resolve: (val) => {
            clearTimeout(timeout);
            resolve(val);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });

        this.bridge?.send(requestPayload).catch((err) => {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to send IPC message: ${err}`));
        });
      });
    }

    // Fallback implementation for browser development / Vite preview
    return this.fallbackCall<T>(method, normalizedParams);
  }

  private validateRpcCall(method: string, params: Record<string, any>): Record<string, any> {
    const methodContract = contract.methods[method];
    if (!methodContract) {
      throw new Error(`RPC method '${method}' is absent from IPC contract v${contract.version}`);
    }

    const normalized = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined)
    );
    const allowed = new Set([...methodContract.required, ...methodContract.optional]);
    const unexpected = Object.keys(normalized).filter((name) => !allowed.has(name));
    if (unexpected.length > 0) {
      throw new Error(`Unexpected params for RPC method '${method}': ${unexpected.join(", ")}`);
    }
    const missing = methodContract.required.filter((name) => !(name in normalized));
    if (missing.length > 0) {
      throw new Error(`Missing params for RPC method '${method}': ${missing.join(", ")}`);
    }
    return normalized;
  }

  private async fallbackCall<T = any>(method: string, params: Record<string, any>): Promise<T> {
    switch (method) {
      case "ping":
        return { status: "pong", version: "0.1.0" } as T;
      case "get_system_info":
        return this.getMockSystemInfo() as T;
      case "update_settings":
        if (params.theme) this.currentTheme = params.theme;
        if (typeof params.reduce_motion === "boolean") this.reduceMotion = params.reduce_motion;
        return this.getMockSystemInfo() as T;
      case "get_models":
        return this.getMockModels() as T;
      case "get_models_directory":
        return { path: "%LOCALAPPDATA%\\VoxNote\\models", is_custom: false } as T;
      case "set_models_directory":
        return { status: "updated", path: params.path || "%LOCALAPPDATA%\\VoxNote\\models" } as T;
      case "select_model":
        this.currentModel = params.model_id;
        return { status: "selected", selected_model: params.model_id } as T;
      case "get_dictionaries":
        return this.getMockDictionaries() as T;
      case "select_dictionary":
        this.currentDictionary = params.dictionary_id;
        return { status: "selected", selected_dictionary: params.dictionary_id } as T;
      case "get_history":
        return this.getMockHistory(params.search_query || "") as T;
      case "get_history_entry":
        return (this.mockHistory.find((e) => e.id === params.entry_id) || null) as T;
      case "update_history_entry":
        return this.updateMockHistoryEntry(params.entry_id, params.title, params.edited_text) as T;
      case "relink_history_audio": {
        const entry = this.updateMockHistoryEntry(params.entry_id);
        const relinked = { ...entry, file_path: params.file_path, file_available: true };
        this.mockHistory[this.mockHistory.findIndex((item) => item.id === params.entry_id)] = relinked;
        return relinked as T;
      }
      case "remove_history_entry":
        this.mockHistory = this.mockHistory.filter((e) => e.id !== params.entry_id);
        return { status: "removed" } as T;
      case "export_text":
        return { status: "exported", path: params.target_file_path } as T;
      case "copy_diagnostics":
        return { diagnostics: `=== VoxNote Diagnostic Report ===\nVersion: 0.1.0\nTheme: ${this.currentTheme}` } as T;
      default:
        throw new Error(`Unsupported fallback method: ${method}`);
    }
  }

  public on<T = any>(event: string, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  public emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  // Typed API Methods
  public async ping(): Promise<{ status: string; version: string }> {
    return this.callRpc("ping");
  }

  public async getSystemInfo(): Promise<SystemInfo> {
    return this.callRpc("get_system_info");
  }

  public async updateSettings(changes: Partial<Pick<SystemInfo, "theme" | "reduce_motion">>): Promise<SystemInfo> {
    return this.callRpc("update_settings", changes);
  }

  public async inspectAudio(filePath: string): Promise<{ status: string; file_path: string }> {
    return this.callRpc("inspect_audio", { file_path: filePath });
  }

  public async startTranscription(
    filePath: string,
    modelId?: string,
    device?: string,
    dictionaryId?: string
  ): Promise<{ status: string; job_id?: string }> {
    return this.callRpc("start_transcription", {
      file_path: filePath,
      model_id: modelId,
      device_preference: device,
      dictionary_id: dictionaryId,
    });
  }

  public async cancelTranscription(): Promise<{ status: string }> {
    return this.callRpc("cancel_transcription");
  }

  public async resumeTranscription(entryId: string): Promise<{ status: string }> {
    return this.callRpc("resume_transcription", { entry_id: entryId });
  }

  public async getModels(): Promise<ModelOption[]> {
    return this.callRpc("get_models");
  }

  public async getModelsDirectory(): Promise<{ path: string; is_custom: boolean }> {
    return this.callRpc("get_models_directory");
  }

  public async setModelsDirectory(path: string): Promise<{ status: string; path: string }> {
    return this.callRpc("set_models_directory", { path });
  }

  public async selectModel(modelId: string): Promise<{ status: string }> {
    return this.callRpc("select_model", { model_id: modelId });
  }

  public async downloadModel(modelId: string): Promise<{ status: string }> {
    return this.callRpc("download_model", { model_id: modelId });
  }

  public async cancelDownload(modelId: string): Promise<{ status: string }> {
    return this.callRpc("cancel_download", { model_id: modelId });
  }

  public async removeModel(modelId: string): Promise<{ status: string }> {
    return this.callRpc("remove_model", { model_id: modelId });
  }

  public async getDictionaries(): Promise<DictionaryOption[]> {
    return this.callRpc("get_dictionaries");
  }

  public async selectDictionary(dictionaryId: string): Promise<{ status: string }> {
    return this.callRpc("select_dictionary", { dictionary_id: dictionaryId });
  }

  public async importCustomDictionary(filePath: string): Promise<{ status: string; term_count: number }> {
    return this.callRpc("import_custom_dictionary", { file_path: filePath });
  }

  public async removeCustomDictionary(): Promise<{ status: string }> {
    return this.callRpc("remove_custom_dictionary");
  }

  public async getHistory(query: string = ""): Promise<{ entries: HistoryEntry[]; groups: HistoryGroup[]; total_count: number }> {
    return this.callRpc("get_history", { search_query: query });
  }

  public async getHistoryEntry(id: string): Promise<HistoryEntry | null> {
    return this.callRpc("get_history_entry", { entry_id: id });
  }

  public async updateHistoryEntry(id: string, title?: string, editedText?: string): Promise<HistoryEntry> {
    return this.callRpc("update_history_entry", { entry_id: id, title, edited_text: editedText });
  }

  public async relinkHistoryAudio(id: string, filePath: string): Promise<HistoryEntry> {
    return this.callRpc("relink_history_audio", { entry_id: id, file_path: filePath });
  }

  public async removeHistoryEntry(id: string): Promise<{ status: string }> {
    return this.callRpc("remove_history_entry", { entry_id: id });
  }

  public async clearHistory(): Promise<{ status: string }> {
    return this.callRpc("clear_history");
  }

  public async exportText(entryId: string, targetPath: string): Promise<{ status: string; path: string }> {
    return this.callRpc("export_text", { entry_id: entryId, target_file_path: targetPath });
  }

  public async copyDiagnostics(): Promise<{ diagnostics: string }> {
    return this.callRpc("copy_diagnostics");
  }

  // Tauri Native Window & File Dialog Helpers
  public async pickAudioFile(): Promise<string | null> {
    if (this.isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string | null>("pick_audio_file");
    }
    return null;
  }

  public async pickDictionaryFile(): Promise<string | null> {
    if (this.isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<string | null>("pick_dictionary_file");
    }
    return null;
  }

  public async minimizeWindow(): Promise<void> {
    if (this.isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("minimize_window");
    }
  }

  public async maximizeWindow(): Promise<void> {
    if (this.isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("maximize_window");
    }
  }

  public async closeWindow(): Promise<void> {
    if (this.isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("close_window");
    }
  }

  public async openExternalUrl(url: string): Promise<void> {
    if (this.isTauri) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke("open_external_url", { url });
    }
    window.open(url, "_blank");
  }

  public async getRuntimeStatus(): Promise<RuntimeStatus> {
    if (!this.isTauri) {
      return {
        ready: true,
        core_installed: true,
        nvidia_installed: true,
        installing: false,
        dev_runtime: true,
        runtime_version: "development",
        runtime_root: "",
        executable: "browser-mock",
        core_size_bytes: 0,
        nvidia_size_bytes: 0,
      };
    }
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<RuntimeStatus>("get_runtime_status");
  }

  public async installRuntime(profile: "cpu" | "nvidia"): Promise<void> {
    if (!this.isTauri) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("install_runtime", { profile });
  }

  public async cancelRuntimeInstall(): Promise<void> {
    if (!this.isTauri) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_runtime_install");
  }

  public async onRuntimeInstallProgress(
    callback: (progress: RuntimeInstallProgress) => void
  ): Promise<() => void> {
    if (!this.isTauri) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<RuntimeInstallProgress>("runtime-install-progress", (event) => callback(event.payload));
  }

  public async onRuntimeInstallFinished(
    callback: (status: RuntimeStatus) => void
  ): Promise<() => void> {
    if (!this.isTauri) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<RuntimeStatus>("runtime-install-finished", (event) => callback(event.payload));
  }

  public async onRuntimeInstallFailed(callback: (error: string) => void): Promise<() => void> {
    if (!this.isTauri) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<string>("runtime-install-failed", (event) => callback(event.payload));
  }

  public async onSidecarStatusChanged(callback: (running: boolean) => void): Promise<() => void> {
    if (!this.isTauri) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<boolean>("sidecar-status-changed", (event) => callback(event.payload));
  }

  // Mock Fallback Helpers
  private getMockSystemInfo(): SystemInfo {
    return {
      version: "0.1.0",
      state: "idle",
      device_capabilities: {
        cuda_available: true,
        gpu_name: "NVIDIA GeForce RTX 4060",
        gpu_label: "NVIDIA GeForce RTX 4060",
        total_memory_mb: 8188,
        unavailable_reason: null,
      },
      device_preference: this.currentDevice,
      selected_model: this.currentModel,
      model_available: true,
      installed_models: ["small", "turbo", "large-v3"],
      selected_dictionary: this.currentDictionary,
      has_custom_dictionary: false,
      theme: this.currentTheme,
      reduce_motion: this.reduceMotion,
    };
  }

  private getMockModels(): ModelOption[] {
    return [
      {
        model_id: "small",
        name: "Быстрая",
        summary: "Компактная модель для слабых ПК и быстрых черновиков.",
        size_bytes: 486000000,
        size_text: "486 МБ",
        recommended: false,
        installed: true,
        selected: this.currentModel === "small",
      },
      {
        model_id: "turbo",
        name: "Сбалансированная",
        summary: "Оптимальный баланс высокой скорости и точности.",
        size_bytes: 1600000000,
        size_text: "1.6 ГБ",
        recommended: true,
        installed: true,
        selected: this.currentModel === "turbo",
      },
      {
        model_id: "large-v3",
        name: "Максимальная точность",
        summary: "Наивысшая точность для сложных терминов и зашумлённых аудиозаписей.",
        size_bytes: 3100000000,
        size_text: "3.1 ГБ",
        recommended: false,
        installed: true,
        selected: this.currentModel === "large-v3",
      },
    ];
  }

  private getMockDictionaries(): DictionaryOption[] {
    return [
      {
        id: "none",
        name: "Без словаря",
        description: "Стандартное распознавание русской речи",
        term_count: 0,
        available: true,
        selected: this.currentDictionary === "none",
        source: "",
      },
      {
        id: "medical-ru",
        name: "Медицинская лекция",
        description: "Термины анатомии, физиологии, фармакологии и синдромов",
        term_count: 320,
        available: true,
        selected: this.currentDictionary === "medical-ru",
        source: "resources/dictionaries/medical_ru.json",
      },
      {
        id: "custom",
        name: "Свой словарь",
        description: "Пользовательский список терминов из UTF-8 файла",
        term_count: 0,
        available: false,
        selected: this.currentDictionary === "custom",
        source: "",
      },
    ];
  }

  private getMockHistory(query: string): { entries: HistoryEntry[]; groups: HistoryGroup[]; total_count: number } {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? this.mockHistory.filter(
          (e) =>
            e.display_title.toLowerCase().includes(q) ||
            e.file_name.toLowerCase().includes(q) ||
            e.current_text.toLowerCase().includes(q)
        )
      : this.mockHistory;

    const todayItems = filtered.filter((e) => e.created_at.startsWith("Сегодня"));
    const weekItems = filtered.filter((e) => e.created_at.includes("нояб.") && (e.created_at.includes("11") || e.created_at.includes("12")));
    const earlierItems = filtered.filter((e) => !todayItems.includes(e) && !weekItems.includes(e));

    const groups: HistoryGroup[] = [];
    if (todayItems.length) groups.push({ group_name: "Сегодня", entries: todayItems });
    if (weekItems.length) groups.push({ group_name: "На этой неделе", entries: weekItems });
    if (earlierItems.length) groups.push({ group_name: "Ранее", entries: earlierItems });

    return {
      entries: filtered,
      groups,
      total_count: filtered.length,
    };
  }

  private updateMockHistoryEntry(id: string, title?: string, editedText?: string): HistoryEntry {
    const idx = this.mockHistory.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error("Entry not found");
    const current = this.mockHistory[idx];
    const updated: HistoryEntry = {
      ...current,
      title: title !== undefined ? title : current.title,
      display_title: title !== undefined ? title : current.display_title,
      edited_text: editedText !== undefined ? editedText : current.edited_text,
      current_text: editedText !== undefined ? editedText : current.current_text,
      has_edits: editedText !== undefined && editedText !== current.text,
    };
    this.mockHistory[idx] = updated;
    return updated;
  }
}

export const sidecarClient = new SidecarClient();
