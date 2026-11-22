import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (payload: any) => void;

const fakeClient = vi.hoisted(() => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    isTauri: true,
    listeners,
    emit(event: string, payload: any) {
      listeners.get(event)?.forEach((listener) => listener(payload));
    },
    on: vi.fn((event: string, listener: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(listener);
      return () => listeners.get(event)?.delete(listener);
    }),
    getHistory: vi.fn(),
    getSystemInfo: vi.fn(),
    updateSettings: vi.fn(),
    getHistoryEntry: vi.fn(),
    getModels: vi.fn(),
    getDictionaries: vi.fn(),
    pickAudioFile: vi.fn(),
    inspectAudio: vi.fn(),
    startTranscription: vi.fn(),
    cancelTranscription: vi.fn(),
    resumeTranscription: vi.fn(),
    updateHistoryEntry: vi.fn(),
    relinkHistoryAudio: vi.fn(),
    removeHistoryEntry: vi.fn(),
    downloadModel: vi.fn(),
    cancelDownload: vi.fn(),
    removeModel: vi.fn(),
    selectModel: vi.fn(),
    selectDictionary: vi.fn(),
    importCustomDictionary: vi.fn(),
    removeCustomDictionary: vi.fn(),
    exportText: vi.fn(),
    pickSaveFile: vi.fn(),
    pickDictionaryFile: vi.fn(),
    openExternalUrl: vi.fn(),
    minimizeWindow: vi.fn(),
    maximizeWindow: vi.fn(),
    closeWindow: vi.fn(),
    getModelsDirectory: vi.fn(),
    setModelsDirectory: vi.fn(),
    getRuntimeStatus: vi.fn(),
    installRuntime: vi.fn(),
    cancelRuntimeInstall: vi.fn(),
    onRuntimeInstallProgress: vi.fn(async () => () => {}),
    onRuntimeInstallFinished: vi.fn(async () => () => {}),
    onRuntimeInstallFailed: vi.fn(async () => () => {}),
    onSidecarStatusChanged: vi.fn(async () => () => {}),
  };
});

const fakeWindowApi = vi.hoisted(() => ({
  closeRequestedHandler: null as null | ((event: { preventDefault: () => void }) => void),
  close: vi.fn(),
  onDragDropEvent: vi.fn(async () => () => {}),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: vi.fn(async (handler) => {
      fakeWindowApi.closeRequestedHandler = handler;
      return () => {
        fakeWindowApi.closeRequestedHandler = null;
      };
    }),
    close: fakeWindowApi.close,
    onDragDropEvent: fakeWindowApi.onDragDropEvent,
  }),
}));

vi.mock("./api/client", () => ({ sidecarClient: fakeClient }));

import App from "./App";

const metadata = {
  file_path: "C:\\audio\\лекция.wav",
  file_name: "лекция.wav",
  file_size: 4096,
  duration_seconds: 60,
  sample_rate: 16000,
  channels: 1,
  codec: "pcm_s16le",
  waveform: [0.1, 0.5, 0.8, 0.2],
};

async function selectAudioFile(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "Новый файл" }));
  await user.click(
    screen.getByText("Перетащите аудиофайл сюда или выберите на компьютере")
  );
  await screen.findByText("лекция.wav");
}

describe("VoxNote application smoke flows", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { convertFileSrc: (path: string) => path },
    });
    window.history.replaceState({}, "", "/");
    fakeClient.listeners.clear();
    fakeWindowApi.closeRequestedHandler = null;
    fakeWindowApi.close.mockClear();
    Object.values(fakeClient).forEach((value) => {
      if (typeof value === "function" && "mockClear" in value) {
        (value as ReturnType<typeof vi.fn>).mockClear();
      }
    });
    localStorage.setItem("voxnote_onboarding_seen", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    fakeClient.getRuntimeStatus.mockResolvedValue({
      ready: true,
      core_installed: true,
      nvidia_installed: true,
      installing: false,
      dev_runtime: true,
      runtime_version: "test",
      runtime_root: "",
      executable: "test-sidecar",
      core_size_bytes: 0,
      nvidia_size_bytes: 0,
    });

    fakeClient.getHistory.mockResolvedValue({ entries: [], groups: [], total_count: 0 });
    fakeClient.getSystemInfo.mockResolvedValue({
      theme: "system",
      reduce_motion: false,
      device_preference: "auto",
    });
    fakeClient.updateSettings.mockResolvedValue({});
    fakeClient.getModels.mockResolvedValue([
      {
        model_id: "small",
        name: "Быстрая",
        summary: "Для быстрых расшифровок",
        size_bytes: 1,
        size_text: "1 Б",
        recommended: true,
        installed: true,
        selected: true,
      },
    ]);
    fakeClient.getDictionaries.mockResolvedValue([
      {
        id: "none",
        name: "Без словаря",
        description: "Стандартное распознавание",
        term_count: 0,
        available: true,
        selected: true,
        source: "",
      },
    ]);
    fakeClient.pickAudioFile.mockResolvedValue(metadata.file_path);
    fakeClient.inspectAudio.mockImplementation(async () => {
      queueMicrotask(() => fakeClient.emit("audio_inspected", metadata));
      return { status: "inspecting", file_path: metadata.file_path };
    });
    fakeClient.startTranscription.mockResolvedValue({ status: "started" });
    fakeClient.cancelTranscription.mockResolvedValue({ status: "cancelling" });
    fakeClient.updateHistoryEntry.mockImplementation(async (id: string, title?: string, text?: string) => ({
      id,
      title: title || "Лекция",
      display_title: title || "Лекция",
      current_text: text || "",
      revisions: [],
    }));
  });

  it("opens on the home screen and moves to the new transcription screen", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText(/Превратите запись в текст/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Экспортировать" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Расшифровать аудио" }));
    expect(
      screen.getByText("Перетащите аудиофайл сюда или выберите на компьютере")
    ).toBeVisible();
  });

  it("selects an audio file and sends the chosen options to the sidecar", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole("button", { name: "Экспортировать" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Копировать текст" })).not.toBeInTheDocument();

    await selectAudioFile(user);
    expect(screen.queryByRole("button", { name: "Экспортировать" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Начать транскрибацию" }));

    await waitFor(() => {
      expect(fakeClient.startTranscription).toHaveBeenCalledWith(
        metadata.file_path,
        "small",
        "auto",
        "none"
      );
    });
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("saves a cancelled transcription and resumes it", async () => {
    const user = userEvent.setup();
    render(<App />);
    await selectAudioFile(user);
    await user.click(screen.getByRole("button", { name: "Начать транскрибацию" }));

    fakeClient.emit("transcription_progress", {
      processed_seconds: 30,
      total_seconds: 60,
      elapsed_seconds: 12,
      percent: 50,
      remaining_percent: 50,
      eta_seconds: 12,
      eta_formatted: "12 сек",
    });

    expect(await screen.findByText("50%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отменить транскрибацию" }));
    expect(fakeClient.cancelTranscription).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Отменяем…" })).toBeDisabled();
    const partialEntry = {
      id: "partial-1",
      created_at: "19.11.2026 18:45",
      file_name: metadata.file_name,
      title: "Лекция",
      display_title: "Лекция",
      duration_seconds: metadata.duration_seconds,
      duration_formatted: "1:00",
      model_id: "small",
      device: "cuda",
      dictionary_id: null,
      text: "Сохранённая часть.",
      preview: "Сохранённая часть.",
      edited_text: null,
      current_text: "Сохранённая часть.",
      has_edits: false,
      segments: [{ start: 0, end: 30, text: "Сохранённая часть." }],
      file_path: metadata.file_path,
      status: "cancelled",
      resume_from_seconds: 30,
      file_available: true,
      revisions: [],
    };
    fakeClient.emit("transcription_cancelled", { history_entry: partialEntry });

    expect(await screen.findByText("Остановлено")).toBeVisible();
    expect(screen.getByRole("button", { name: "Экспортировать" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Продолжить" }));
    expect(fakeClient.resumeTranscription).toHaveBeenCalledWith("partial-1");
    expect(await screen.findByRole("button", { name: "Отменить транскрибацию" })).toBeVisible();
  });

  it("shows a sidecar launch error and allows a CPU retry", async () => {
    const user = userEvent.setup();
    fakeClient.startTranscription
      .mockRejectedValueOnce(new Error("CUDA недоступна"))
      .mockResolvedValueOnce({ status: "started" });
    render(<App />);
    await selectAudioFile(user);
    await user.click(screen.getByRole("button", { name: "Начать транскрибацию" }));

    expect(await screen.findByText("CUDA недоступна")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Повторить на процессоре/ }));

    await waitFor(() => expect(fakeClient.startTranscription).toHaveBeenCalledTimes(2));
    expect(fakeClient.startTranscription).toHaveBeenLastCalledWith(
      metadata.file_path,
      "small",
      "cpu",
      "none"
    );
  });

  it("does not offer a CPU retry for a non-GPU transcription error", async () => {
    const user = userEvent.setup();
    render(<App />);
    await selectAudioFile(user);
    await user.click(screen.getByRole("button", { name: "Начать транскрибацию" }));

    fakeClient.emit("transcription_error", {
      message: "Аудиофайл повреждён",
      recoverable_on_cpu: false,
    });

    expect(await screen.findByText("Аудиофайл повреждён")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Повторить на процессоре/ })).not.toBeInTheDocument();
  });

  it("asks before closing during transcription and cancels before exit", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: { invoke: vi.fn(), convertFileSrc: (path: string) => path },
    });
    const user = userEvent.setup();
    render(<App />);
    await selectAudioFile(user);
    await user.click(screen.getByRole("button", { name: "Начать транскрибацию" }));
    await waitFor(() => expect(fakeWindowApi.closeRequestedHandler).not.toBeNull());

    const preventDefault = vi.fn();
    fakeWindowApi.closeRequestedHandler!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(await screen.findByRole("dialog")).toHaveTextContent("Транскрибация ещё выполняется");

    await user.click(screen.getByRole("button", { name: "Остановить и закрыть" }));
    expect(fakeClient.cancelTranscription).toHaveBeenCalledOnce();
    expect(fakeWindowApi.close).not.toHaveBeenCalled();

    fakeClient.emit("transcription_cancelled", {});
    await waitFor(() => expect(fakeWindowApi.close).toHaveBeenCalledOnce());
  });

  it("keeps navigation and maintenance actions locked during transcription", async () => {
    const user = userEvent.setup();
    render(<App />);
    await selectAudioFile(user);
    await user.click(screen.getByRole("button", { name: "Начать транскрибацию" }));

    expect(screen.getByRole("button", { name: "Новый файл" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Настройки" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Проверить обновления" })).toBeDisabled();

    await user.keyboard("{Control>}n{/Control}");
    expect(screen.getByRole("button", { name: "Отменить транскрибацию" })).toBeVisible();
  });

  it("retries bootstrap until the sidecar is ready", async () => {
    fakeClient.getSystemInfo
      .mockRejectedValueOnce(new Error("sidecar is starting"))
      .mockResolvedValue({
        theme: "system",
        reduce_motion: false,
        device_preference: "auto",
      });

    render(<App />);

    await waitFor(() => expect(fakeClient.getSystemInfo).toHaveBeenCalledTimes(2), {
      timeout: 2000,
    });
  });

  it("opens the documentation preview without first-run onboarding", async () => {
    localStorage.removeItem("voxnote_onboarding_seen");
    window.history.replaceState({}, "", "/?preview=documentation");

    render(<App />);

    expect(await screen.findByText("Превратите запись в текст,")).toBeVisible();
    expect(screen.queryByRole("dialog", { name: "Как устроен VoxNote" })).not.toBeInTheDocument();
  });

  it("persists the reduced-motion preference from settings", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Настройки" }));
    await user.click(screen.getByRole("checkbox", { name: /Снизить анимации/ }));

    expect(fakeClient.updateSettings).toHaveBeenCalledWith({ reduce_motion: true });
    expect(document.documentElement).toHaveAttribute("data-reduce-motion", "true");
  });

  it("allows installing the NVIDIA accelerator pack from preferences", async () => {
    fakeClient.getRuntimeStatus.mockResolvedValueOnce({
      ready: true,
      core_installed: true,
      nvidia_installed: false,
      installing: false,
      dev_runtime: true,
      runtime_version: "test",
      runtime_root: "",
      executable: "test-sidecar",
      core_size_bytes: 100,
      nvidia_size_bytes: 500,
    });
    fakeClient.installRuntime.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Настройки" }));
    expect(screen.getByText("Ускорение NVIDIA (CUDA)")).toBeVisible();
    const installButton = screen.getByRole("button", { name: "Установить GPU" });
    await user.click(installButton);

    expect(fakeClient.installRuntime).toHaveBeenCalledWith("nvidia");
  });

  it("exports note text via native save dialog when in Tauri mode", async () => {
    const entry = {
      id: "entry-1",
      display_title: "Адренорецепторы",
      current_text: "Текст лекции про рецепторы",
      text: "Текст лекции про рецепторы",
      file_path: "C:\\audio\\lecture.wav",
      file_available: true,
      duration_formatted: "10:00",
      has_edits: false,
      revisions: [],
      segments: [],
    };
    fakeClient.getHistory.mockResolvedValueOnce({
      entries: [entry],
      groups: [{ label: "Сегодня", entries: [entry] }],
      total_count: 1,
    });
    fakeClient.getHistoryEntry.mockResolvedValueOnce(entry);
    fakeClient.isTauri = true;
    fakeClient.pickSaveFile.mockResolvedValueOnce("C:\\Users\\test\\Desktop\\Адренорецепторы.txt");
    fakeClient.exportText.mockResolvedValueOnce({ status: "exported", path: "C:\\Users\\test\\Desktop\\Адренорецепторы.txt" });

    const user = userEvent.setup();
    render(<App />);

    const [sidebarItem] = await screen.findAllByText("Адренорецепторы");
    await user.click(sidebarItem);
    await user.click(screen.getByRole("button", { name: /Экспортировать/ }));
    await user.click(screen.getByText("Обычный текст (.txt)"));

    expect(fakeClient.pickSaveFile).toHaveBeenCalledWith(
      "Адренорецепторы.txt",
      "Текстовые файлы (*.txt)",
      "txt"
    );
    expect(fakeClient.exportText).toHaveBeenCalledWith(
      "entry-1",
      "C:\\Users\\test\\Desktop\\Адренорецепторы.txt"
    );
  });
});
