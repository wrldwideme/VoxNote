import React, { useRef, useState, useEffect, DragEvent } from "react";
import { Upload, RefreshCw, FolderOpen, Play, Pause } from "lucide-react";
import { Button } from "./Button";
import { Waveform } from "./Waveform";
import { AudioMetadata, TranscriptionProgress } from "../types/ipc";
import { sidecarClient } from "../api/client";

export interface WorkspaceNewProps {
  onFileSelected: (fileOrPath: File | string) => void;
  onStartTranscription: () => void;
  onCancelTranscription: () => void;
  selectedFilePath: string | null;
  selectedFileName: string | null;
  selectedFileSize: number | null;
  audioMetadata: AudioMetadata | null;
  isInspectingAudio: boolean;
  isProcessing: boolean;
  isCancelling: boolean;
  progress: TranscriptionProgress | null;
  processingPhase: "loading_model" | "transcribing" | "finalizing";
  processingModelLabel: string;
  processingDeviceLabel: string;
  error: string | null;
  onRetryOnCpu: () => void;
  canRetryOnCpu?: boolean;
}

const sampleWaveform = [15, 20, 28, 18, 35, 25, 40, 20, 30, 25, 18, 32, 22, 28, 19, 31, 24, 18, 35, 22];

export const WorkspaceNew: React.FC<WorkspaceNewProps> = ({
  onFileSelected,
  onStartTranscription,
  onCancelTranscription,
  selectedFilePath,
  selectedFileName,
  selectedFileSize,
  audioMetadata,
  isInspectingAudio,
  isProcessing,
  isCancelling,
  progress,
  processingPhase,
  processingModelLabel,
  processingDeviceLabel,
  error,
  onRetryOnCpu,
  canRetryOnCpu = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPickingFileRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [isProgressStalled, setIsProgressStalled] = useState(false);
  const [processingElapsedSeconds, setProcessingElapsedSeconds] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const onFileSelectedRef = useRef(onFileSelected);
  const [previewSrc, setPreviewSrc] = useState<string>("");

  useEffect(() => {
    onFileSelectedRef.current = onFileSelected;
  }, [onFileSelected]);

  useEffect(() => {
    const isTauri =
      typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
    if (!isTauri) return;

    let disposed = false;
    let unlisten: (() => void) | null = null;
    void import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) =>
        getCurrentWindow().onDragDropEvent((event) => {
          if (disposed) return;
          if (event.payload.type === "drop") {
            setIsDragging(false);
            const firstPath = event.payload.paths[0];
            if (firstPath) onFileSelectedRef.current(firstPath);
          } else if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragging(true);
          } else {
            setIsDragging(false);
          }
        }),
      )
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch((error) => console.warn("[AudioDrop] native drag-and-drop unavailable:", error));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!selectedFilePath) {
      setPreviewSrc("");
      setIsPlayingPreview(false);
      return;
    }
    if (typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__)) {
      import("@tauri-apps/api/core").then(({ convertFileSrc }) => {
        setPreviewSrc(convertFileSrc(selectedFilePath));
      });
    } else {
      setPreviewSrc(selectedFilePath);
    }
  }, [selectedFilePath]);

  useEffect(() => {
    if (!isProcessing) {
      setIsProgressStalled(false);
      return;
    }

    setIsProgressStalled(false);
    // Model loading and VAD can legitimately take longer on a large recording before
    // the first processed timestamp exists. Only subsequent progress gaps use the
    // stricter threshold; otherwise normal preparation looks like a frozen worker.
    const stallTimeoutMs = progress ? 15_000 : 60_000;
    const timeoutId = window.setTimeout(() => setIsProgressStalled(true), stallTimeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [isProcessing, progress?.processed_seconds]);

  useEffect(() => {
    if (!isProcessing) {
      setProcessingElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setProcessingElapsedSeconds(0);
    const intervalId = window.setInterval(() => {
      setProcessingElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [isProcessing]);

  const togglePlayPreview = () => {
    const audio = previewAudioRef.current;
    if (!audio || !previewSrc) return;
    if (isPlayingPreview) {
      audio.pause();
    } else {
      audio.play().catch((err) => console.warn("[PreviewAudio] playback failed:", err));
    }
  };

  const handlePickFile = async () => {
    const isTauri =
      typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);
    if (!isTauri) {
      fileInputRef.current?.click();
      return;
    }
    if (isPickingFileRef.current) return;

    isPickingFileRef.current = true;
    try {
      const picked = await sidecarClient.pickAudioFile();
      if (picked) {
        onFileSelected(picked);
      }
    } catch (err) {
      console.warn("[AudioPicker] native dialog failed:", err);
    } finally {
      isPickingFileRef.current = false;
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0];
      const fullPath = (f as any).path || f;
      onFileSelected(fullPath);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const formatDuration = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      : `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const processingStageText =
    processingPhase === "loading_model"
      ? "Загружаем модель в память…"
      : processingPhase === "finalizing"
        ? "Формируем итоговый текст…"
        : progress
          ? "Распознаём русскую речь локально…"
          : "Анализируем речь и тишину, готовим первый фрагмент…";
  const activeProcessingStep =
    processingPhase === "loading_model"
      ? 1
      : processingPhase === "finalizing"
        ? 4
        : progress
          ? 3
          : 2;
  const processingSteps = ["Чтение файла", "Загрузка модели", "Анализ речи", "Распознавание", "Сохранение"];

  return (
    <div className="flex-1 h-full overflow-y-auto px-8 py-8 flex flex-col items-center justify-center bg-brand-background dark:bg-dark-background">
      <div className="w-full max-w-xl space-y-6">
        {/* Error Banner if any */}
        {error && (
          <div className="p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/30 text-brand-danger text-xs space-y-2 animate-in fade-in">
            <div className="font-semibold">{error}</div>
            {canRetryOnCpu && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={onRetryOnCpu} icon={<RefreshCw size={13} />}>
                  Повторить на процессоре (CPU)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Processing State */}
        {isProcessing ? (
          <div className="p-6 rounded-2xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-card space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-brand-text dark:text-dark-text truncate max-w-md">
                  {selectedFileName || "Аудиозапись"}
                </h3>
                <p className="text-xs text-brand-text-secondary dark:text-dark-text-secondary mt-0.5">
                  {processingStageText}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded-md bg-black/5 px-2 py-1 text-brand-text-secondary dark:bg-white/5 dark:text-dark-text-secondary">
                    Модель: <strong className="text-brand-text dark:text-dark-text">{processingModelLabel}</strong>
                  </span>
                  <span className="rounded-md bg-black/5 px-2 py-1 text-brand-text-secondary dark:bg-white/5 dark:text-dark-text-secondary">
                    Устройство: <strong className="text-brand-text dark:text-dark-text">{processingDeviceLabel}</strong>
                  </span>
                </div>
              </div>

              <span className="text-lg font-bold text-brand-primary tabular-nums">
                {progress?.percent != null ? `${Math.round(progress.percent)}%` : "0%"}
              </span>
            </div>

            <div className="space-y-2" aria-label="Этапы транскрибации">
              <div className="flex gap-1.5" aria-hidden="true">
                {processingSteps.map((step, index) => (
                  <span
                    key={step}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      index <= activeProcessingStep
                        ? "bg-brand-primary"
                        : "bg-brand-border/70 dark:bg-dark-border"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px] text-brand-text-secondary dark:text-dark-text-secondary">
                <span>
                  Этап {activeProcessingStep + 1} из {processingSteps.length} · <strong className="font-semibold text-brand-text dark:text-dark-text">{processingSteps[activeProcessingStep]}</strong>
                </span>
                {activeProcessingStep < processingSteps.length - 1 && (
                  <span className="hidden sm:inline">Далее: {processingSteps[activeProcessingStep + 1]}</span>
                )}
              </div>
            </div>

            {/* Waveform and Progress Bar */}
            <div className="space-y-2">
              <Waveform
                data={audioMetadata?.waveform || sampleWaveform}
                progress={(progress?.percent || 0) / 100}
                height={48}
              />

              <div className="w-full h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-primary transition-all duration-300"
                  style={{ width: `${progress?.percent || 0}%` }}
                />
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 gap-1.5 text-xs text-brand-text-secondary dark:text-dark-text-secondary tabular-nums sm:grid-cols-3">
              <span className="text-left">
                {progress?.processed_seconds != null
                  ? `Обработано ${formatDuration(progress.processed_seconds)}${
                      audioMetadata?.duration_seconds
                        ? ` из ${formatDuration(audioMetadata.duration_seconds)}`
                        : ""
                    }`
                  : "Ожидаем первый фрагмент…"}
              </span>
              <span className="text-center">Прошло {formatDuration(processingElapsedSeconds)}</span>
              <span className="text-right">
                {isProgressStalled
                  ? "Нет прогресса, проверяем состояние…"
                  : progress?.eta_formatted && progress.eta_formatted !== "—"
                    ? `Осталось примерно ${progress.eta_formatted}`
                    : processingElapsedSeconds < 30
                      ? `Расчёт остатка через ${30 - processingElapsedSeconds} сек`
                      : "Рассчитываем оставшееся время…"}
              </span>
            </div>

            <div className="flex justify-center pt-2">
              <Button
                variant="danger"
                size="sm"
                onClick={onCancelTranscription}
                disabled={isCancelling}
              >
                {isCancelling ? "Отменяем…" : "Отменить транскрибацию"}
              </Button>
            </div>
          </div>
        ) : selectedFilePath ? (
          /* File Selected Card */
          <div className="p-6 rounded-2xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-card space-y-5 animate-in fade-in">
            {isInspectingAudio && (
              <div className="rounded-lg bg-brand-primary-light px-3 py-2 text-xs font-semibold text-brand-primary dark:bg-dark-primary-light">
                Читаем файл: определяем длительность и строим звуковую волну…
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <button
                  onClick={togglePlayPreview}
                  className="w-10 h-10 rounded-xl bg-brand-primary-light dark:bg-dark-primary-light hover:bg-brand-primary hover:text-white flex items-center justify-center text-brand-primary transition-colors cursor-pointer shrink-0 shadow-subtle group"
                  title={isPlayingPreview ? "Пауза" : "Воспроизвести аудиозапись"}
                >
                  {isPlayingPreview ? (
                    <Pause size={18} />
                  ) : (
                    <Play size={18} className="ml-0.5 fill-current" />
                  )}
                </button>
                <audio
                  ref={previewAudioRef}
                  src={previewSrc || undefined}
                  onPlay={() => setIsPlayingPreview(true)}
                  onPause={() => setIsPlayingPreview(false)}
                  onEnded={() => setIsPlayingPreview(false)}
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-brand-text dark:text-dark-text truncate">
                    {selectedFileName}
                  </h3>
                  <div className="text-xs text-brand-text-secondary dark:text-dark-text-secondary flex items-center gap-2 mt-0.5">
                    {selectedFileSize && <span>{formatFileSize(selectedFileSize)}</span>}
                    {audioMetadata?.duration_seconds && (
                      <>
                        <span>·</span>
                        <span>{Math.round(audioMetadata.duration_seconds)} сек</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={handlePickFile}
                disabled={isInspectingAudio}
                icon={<FolderOpen size={13} />}
              >
                Изменить файл
              </Button>
            </div>

            {/* Waveform preview */}
            <div className="py-1">
              <Waveform data={audioMetadata?.waveform || sampleWaveform} height={40} />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="primary"
                size="lg"
                onClick={onStartTranscription}
                disabled={isInspectingAudio}
              >
                {isInspectingAudio ? "Анализируем аудио…" : "Начать транскрибацию"}
              </Button>
            </div>
          </div>
        ) : (
          /* Drag & Drop Empty Dropzone */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handlePickFile}
            className={`p-10 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-all duration-200 ${
              isDragging
                ? "border-brand-primary bg-brand-primary-light/40 dark:bg-dark-primary-light/20 scale-[1.01]"
                : "border-brand-border dark:border-dark-border hover:border-brand-primary/50 bg-brand-surface dark:bg-dark-surface"
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-primary-light dark:bg-dark-primary-light flex items-center justify-center text-brand-primary shadow-subtle">
              <Upload size={24} />
            </div>

            <div className="space-y-1">
              <p className="text-sm font-semibold text-brand-text dark:text-dark-text">
                Перетащите аудиофайл сюда или выберите на компьютере
              </p>
              <p className="text-xs text-brand-text-secondary dark:text-dark-text-secondary">
                Поддерживаются M4A, MP3, WAV, FLAC и OGG (русская речь)
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".m4a,.mp3,.wav,.flac,.ogg"
              className="hidden"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const f = e.target.files[0];
                  const fullPath = (f as any).path || f;
                  onFileSelected(fullPath);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
