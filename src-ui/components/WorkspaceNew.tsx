import React, { useRef, useState, DragEvent } from "react";
import { Upload, FileAudio, RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { Waveform } from "./Waveform";
import { AudioMetadata, TranscriptionProgress } from "../types/ipc";

export interface WorkspaceNewProps {
  onFileSelected: (file: File) => void;
  onStartTranscription: () => void;
  onCancelTranscription: () => void;
  selectedFile: File | null;
  audioMetadata: AudioMetadata | null;
  isProcessing: boolean;
  progress: TranscriptionProgress | null;
  error: string | null;
  onRetryOnCpu: () => void;
}

const sampleWaveform = [15, 20, 28, 18, 35, 25, 40, 20, 30, 25, 18, 32, 22, 28, 19, 31, 24, 18, 35, 22];

export const WorkspaceNew: React.FC<WorkspaceNewProps> = ({
  onFileSelected,
  onStartTranscription,
  onCancelTranscription,
  selectedFile,
  audioMetadata,
  isProcessing,
  progress,
  error,
  onRetryOnCpu,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

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
      onFileSelected(e.dataTransfer.files[0]);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  return (
    <div className="flex-1 h-full overflow-y-auto px-8 py-8 flex flex-col items-center justify-center bg-brand-background dark:bg-dark-background">
      <div className="w-full max-w-xl space-y-6">
        {/* Error Banner if any */}
        {error && (
          <div className="p-4 rounded-xl bg-brand-danger/10 border border-brand-danger/30 text-brand-danger text-xs space-y-2 animate-in fade-in">
            <div className="font-semibold">{error}</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={onRetryOnCpu} icon={<RefreshCw size={13} />}>
                Повторить на процессоре (CPU)
              </Button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {isProcessing ? (
          <div className="p-6 rounded-2xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-card space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-brand-text dark:text-dark-text truncate max-w-md">
                  {selectedFile?.name || "Аудиозапись"}
                </h3>
                <p className="text-xs text-brand-text-secondary dark:text-dark-text-secondary mt-0.5">
                  Распознаём русскую речь локально...
                </p>
              </div>

              <span className="text-lg font-bold text-brand-primary tabular-nums">
                {progress?.percent != null ? `${Math.round(progress.percent)}%` : "Подготовка..."}
              </span>
            </div>

            {/* Waveform and Progress Bar */}
            <div className="space-y-2">
              <Waveform
                data={audioMetadata?.waveform || sampleWaveform}
                progress={(progress?.percent || 0) / 100}
                height={48}
              />

              <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-primary transition-all duration-200"
                  style={{ width: `${progress?.percent || 0}%` }}
                />
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center justify-between text-xs text-brand-text-secondary dark:text-dark-text-secondary tabular-nums">
              <span>
                {progress?.processed_seconds != null
                  ? `${Math.round(progress.processed_seconds)} сек обработано`
                  : "Анализируем поток..."}
              </span>
              <span>
                {progress?.eta_formatted && progress.eta_formatted !== "—"
                  ? `Осталось ~ ${progress.eta_formatted}`
                  : "Оцениваем время..."}
              </span>
            </div>

            <div className="flex justify-center pt-2">
              <Button variant="danger" size="sm" onClick={onCancelTranscription}>
                Отменить транскрибацию
              </Button>
            </div>
          </div>
        ) : selectedFile ? (
          /* File Selected Card */
          <div className="p-6 rounded-2xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-card space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0 pr-2">
                <div className="w-10 h-10 rounded-xl bg-brand-primary-light dark:bg-dark-primary-light flex items-center justify-center text-brand-primary shrink-0">
                  <FileAudio size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-brand-text dark:text-dark-text truncate">
                    {selectedFile.name}
                  </h3>
                  <div className="text-xs text-brand-text-secondary dark:text-dark-text-secondary flex items-center gap-2 mt-0.5">
                    <span>{formatFileSize(selectedFile.size)}</span>
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
                onClick={() => fileInputRef.current?.click()}
              >
                Изменить файл
              </Button>
            </div>

            {/* Waveform preview */}
            <div className="py-1">
              <Waveform data={audioMetadata?.waveform || sampleWaveform} height={40} />
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="primary" size="lg" onClick={onStartTranscription}>
                Начать транскрибацию
              </Button>
            </div>
          </div>
        ) : (
          /* Drag & Drop Empty Dropzone */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
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
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  onFileSelected(e.target.files[0]);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
