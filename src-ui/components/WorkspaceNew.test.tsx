import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { sidecarClient } from "../api/client";
import { WorkspaceNew, WorkspaceNewProps } from "./WorkspaceNew";

function makeProps(overrides: Partial<WorkspaceNewProps> = {}): WorkspaceNewProps {
  return {
    onFileSelected: vi.fn(),
    onStartTranscription: vi.fn(),
    onCancelTranscription: vi.fn(),
    selectedFilePath: null,
    selectedFileName: null,
    selectedFileSize: null,
    audioMetadata: null,
    isInspectingAudio: false,
    isProcessing: false,
    isCancelling: false,
    progress: null,
    processingPhase: "loading_model",
    processingModelLabel: "Быстрая (small)",
    processingDeviceLabel: "Видеокарта NVIDIA (CUDA)",
    error: null,
    onRetryOnCpu: vi.fn(),
    ...overrides,
  };
}

describe("WorkspaceNew", () => {
  it("accepts a supported audio file from the browser input", () => {
    const props = makeProps();
    const { container } = render(<WorkspaceNew {...props} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(["audio"], "лекция.wav", { type: "audio/wav" });

    fireEvent.change(input!, { target: { files: [file] } });

    expect(props.onFileSelected).toHaveBeenCalledWith(file);
  });

  it("opens the browser file input only once", async () => {
    const user = userEvent.setup();
    const props = makeProps();
    const { container } = render(<WorkspaceNew {...props} />);
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const browserInputClick = vi.spyOn(input, "click");

    await user.click(screen.getByText("Перетащите аудиофайл сюда или выберите на компьютере"));

    expect(browserInputClick).toHaveBeenCalledOnce();
  });

  it("does not open a second dialog when the native picker is cancelled", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const pickAudioFile = vi.spyOn(sidecarClient, "pickAudioFile").mockResolvedValue(null);
    const browserInputClick = vi.spyOn(HTMLInputElement.prototype, "click");
    const user = userEvent.setup();
    const props = makeProps();

    render(<WorkspaceNew {...props} />);
    await user.click(screen.getByText("Перетащите аудиофайл сюда или выберите на компьютере"));

    expect(pickAudioFile).toHaveBeenCalledOnce();
    expect(browserInputClick).not.toHaveBeenCalled();
    expect(props.onFileSelected).not.toHaveBeenCalled();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it("starts transcription for a selected file", async () => {
    const user = userEvent.setup();
    const props = makeProps({
      selectedFilePath: "C:\\audio\\лекция.wav",
      selectedFileName: "лекция.wav",
      selectedFileSize: 2048,
    });
    render(<WorkspaceNew {...props} />);

    await user.click(screen.getByRole("button", { name: "Начать транскрибацию" }));

    expect(props.onStartTranscription).toHaveBeenCalledOnce();
  });

  it("does not start while the selected audio is still being inspected", () => {
    const props = makeProps({
      selectedFilePath: "C:\\audio\\лекция.wav",
      selectedFileName: "лекция.wav",
      isInspectingAudio: true,
    });
    render(<WorkspaceNew {...props} />);

    expect(screen.getByRole("button", { name: "Анализируем аудио…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Изменить файл" })).toBeDisabled();
  });

  it("shows backend progress and allows cancellation", async () => {
    const user = userEvent.setup();
    const props = makeProps({
      selectedFilePath: "C:\\audio\\лекция.wav",
      selectedFileName: "лекция.wav",
      isProcessing: true,
      progress: {
        processed_seconds: 25,
        total_seconds: 60,
        elapsed_seconds: 10,
        percent: 42,
        remaining_percent: 58,
        eta_seconds: 14,
        eta_formatted: "14 сек",
      },
    });
    render(<WorkspaceNew {...props} />);

    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getByText("Обработано 0:25")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Отменить транскрибацию" }));
    expect(props.onCancelTranscription).toHaveBeenCalledOnce();
  });

  it("keeps the processing screen while backend cancellation is pending", () => {
    const props = makeProps({
      selectedFilePath: "C:\\audio\\лекция.wav",
      selectedFileName: "лекция.wav",
      isProcessing: true,
      isCancelling: true,
    });
    render(<WorkspaceNew {...props} />);

    expect(screen.getByRole("button", { name: "Отменяем…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Начать транскрибацию" })).not.toBeInTheDocument();
  });

  it("reports when backend progress has stopped", () => {
    vi.useFakeTimers();
    try {
      render(
        <WorkspaceNew
          {...makeProps({
            selectedFilePath: "C:\\audio\\лекция.wav",
            selectedFileName: "лекция.wav",
            isProcessing: true,
            progress: {
              processed_seconds: 10,
              total_seconds: 100,
              elapsed_seconds: 5,
              percent: 10,
              remaining_percent: 90,
              eta_seconds: 45,
              eta_formatted: "45 сек",
            },
          })}
        />
      );

      act(() => vi.advanceTimersByTime(15_000));

      expect(screen.getByText("Нет прогресса, проверяем состояние…")).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a recoverable error and exposes CPU retry", async () => {
    const user = userEvent.setup();
    const props = makeProps({ error: "Не удалось запустить CUDA" });
    render(<WorkspaceNew {...props} />);

    expect(screen.getByText("Не удалось запустить CUDA")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Повторить на процессоре/ }));
    expect(props.onRetryOnCpu).toHaveBeenCalledOnce();
  });
});
