import React from "react";
import { BookOpen, BrainCircuit, MonitorCog } from "lucide-react";
import { Modal } from "../Modal";
import { ThemeMode } from "../../types/ipc";

export interface PreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  reduceMotion: boolean;
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
