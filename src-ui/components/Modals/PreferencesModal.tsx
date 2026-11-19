import React from "react";
import { BookOpen, BrainCircuit, Cpu, Download, MonitorCog, Zap } from "lucide-react";
import { Modal } from "../Modal";
import { ThemeMode } from "../../types/ipc";
import { RuntimeInstallProgress, RuntimeStatus } from "../../api/client";

export interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  reduceMotion: boolean;
  runtimeStatus?: RuntimeStatus | null;
  onInstallNvidia?: () => void;
  onCancelInstallNvidia?: () => void;
  isInstallingNvidia?: boolean;
  installProgress?: RuntimeInstallProgress | null;
  installError?: string | null;
  onChangeTheme: (theme: ThemeMode) => void;
  onChangeReduceMotion: (enabled: boolean) => void;
  onOpenModels: () => void;
  onOpenDictionaries: () => void;
}

export const PreferencesModal: React.FC<PreferencesModalProps> = ({
  isOpen,
  onClose,
  theme,
  reduceMotion,
  runtimeStatus,
  onInstallNvidia,
  onCancelInstallNvidia,
  isInstallingNvidia = false,
  installProgress,
  installError,
  onChangeTheme,
  onChangeReduceMotion,
  onOpenModels,
  onOpenDictionaries,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Настройки VoxNote"
    description="Параметры сохраняются локально на этом компьютере."
    maxWidth="md"
  >
    <div className="space-y-4 py-1 text-xs">
      {/* ML-движок и аппаратное ускорение */}
      <div className="rounded-xl border border-brand-border p-3.5 dark:border-dark-border">
        <div className="mb-2 flex items-center justify-between font-semibold">
          <div className="flex items-center gap-2">
            <Cpu size={15} className="text-brand-primary" />
            Движок и ускорение
          </div>
          {runtimeStatus?.runtime_version && (
            <span className="text-[11px] text-brand-text-secondary">
              v{runtimeStatus.runtime_version}
            </span>
          )}
        </div>

        {/* Статус базового CPU-движка */}
        <div className="flex items-center justify-between py-2 border-b border-brand-border/40 dark:border-dark-border/40 text-xs">
          <div>
            <div className="font-semibold">Базовый движок (CPU)</div>
            <div className="text-[11px] text-brand-text-secondary">
              Локальное ML-ядро для распознавания на процессоре
            </div>
          </div>
          <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
            Установлен
          </span>
        </div>

        {/* Статус ускорения NVIDIA */}
        <div className="pt-2 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 font-semibold">
                <Zap
                  size={14}
                  className={runtimeStatus?.nvidia_installed ? "text-brand-primary" : "text-brand-text-secondary"}
                />
                Ускорение NVIDIA (CUDA)
              </div>
              <div className="mt-0.5 text-[11px] text-brand-text-secondary">
                {runtimeStatus?.nvidia_installed
                  ? "Пакет библиотек CUDA установлен. Видеокарта задействуется для ускорения."
                  : "Опциональный пакет (~667 МБ). Ускоряет транскрибацию в разы на видеокартах GeForce RTX/GTX."}
              </div>
            </div>

            {runtimeStatus?.nvidia_installed ? (
              <span className="shrink-0 rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
                Активно
              </span>
            ) : !isInstallingNvidia && onInstallNvidia ? (
              <button
                type="button"
                onClick={onInstallNvidia}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-2.5 py-1.5 text-xs font-semibold text-white shadow-subtle hover:bg-brand-primary-hover transition-colors cursor-pointer"
              >
                <Download size={13} />
                Установить GPU
              </button>
            ) : null}
          </div>

          {/* Индикатор загрузки пакета NVIDIA */}
          {isInstallingNvidia && (
            <div className="mt-3 space-y-2 rounded-lg bg-black/[0.03] p-2.5 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold">
                  {installProgress
                    ? installProgress.phase === "verifying"
                      ? "Проверяем SHA-256 пакета NVIDIA…"
                      : installProgress.phase === "extracting"
                      ? "Устанавливаем библиотеки CUDA…"
                      : installProgress.phase === "completed"
                      ? "Ускорение NVIDIA готово!"
                      : "Скачиваем пакет NVIDIA…"
                    : "Подготовка к установке…"}
                </span>
                <span className="font-bold tabular-nums text-brand-primary">
                  {Math.round(installProgress?.percent ?? 0)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-brand-primary transition-[width] duration-150"
                  style={{ width: `${installProgress?.percent ?? 0}%` }}
                />
              </div>
              {onCancelInstallNvidia && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onCancelInstallNvidia}
                    className="text-[11px] font-semibold text-brand-danger hover:underline cursor-pointer"
                  >
                    Отменить
                  </button>
                </div>
              )}
            </div>
          )}

          {installError && (
            <div className="mt-2 rounded-lg border border-brand-danger/30 bg-brand-danger/10 p-2 text-[11px] text-brand-danger">
              {installError}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-brand-border p-3.5 dark:border-dark-border">
        <div className="mb-3 flex items-center gap-2 font-semibold">
          <MonitorCog size={15} className="text-brand-primary" />
          Оформление
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as ThemeMode[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChangeTheme(option)}
              className={`rounded-lg border px-3 py-2 font-semibold transition-colors ${
                theme === option
                  ? "border-brand-primary bg-brand-primary-light text-brand-primary dark:bg-dark-primary-light"
                  : "border-brand-border hover:bg-black/5 dark:border-dark-border dark:hover:bg-white/5"
              }`}
            >
              {option === "system" ? "Как в Windows" : option === "light" ? "Светлая" : "Тёмная"}
            </button>
          ))}
        </div>
        <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-black/[0.03] px-3 py-2.5 dark:bg-white/[0.04]">
          <span>
            <span className="block font-semibold">Снизить анимации</span>
            <span className="mt-0.5 block text-[11px] text-brand-text-secondary">Отключает циклическое движение и почти все переходы.</span>
          </span>
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => onChangeReduceMotion(event.target.checked)}
            className="h-4 w-4 accent-brand-primary"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={onOpenModels} className="flex items-center gap-2 rounded-xl border border-brand-border p-3 text-left font-semibold hover:bg-black/5 dark:border-dark-border dark:hover:bg-white/5">
          <BrainCircuit size={16} className="text-brand-primary" />
          Модели распознавания
        </button>
        <button type="button" onClick={onOpenDictionaries} className="flex items-center gap-2 rounded-xl border border-brand-border p-3 text-left font-semibold hover:bg-black/5 dark:border-dark-border dark:hover:bg-white/5">
          <BookOpen size={16} className="text-brand-primary" />
          Словари терминов
        </button>
      </div>
    </div>
  </Modal>
);
