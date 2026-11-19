import React from "react";
import { ChevronDown, Moon, Sun, Cpu, SlidersHorizontal, BookOpen, LockKeyhole } from "lucide-react";
import { Badge } from "./Badge";
import { DevicePreference, ThemeMode } from "../types/ipc";

export interface TopBarProps {
  modelName: string;
  devicePreference: DevicePreference;
  deviceLabel?: string;
  dictionaryName: string;
  controlsLocked?: boolean;
  contextLabel?: string;
  theme: ThemeMode;
  onOpenModels: () => void;
  onOpenDictionaries: () => void;
  onToggleDevice: () => void;
  onToggleTheme: () => void;
  onOpenPrivacyInfo: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  modelName,
  devicePreference,
  deviceLabel,
  dictionaryName,
  controlsLocked = false,
  contextLabel,
  theme,
  onOpenModels,
  onOpenDictionaries,
  onToggleDevice,
  onToggleTheme,
  onOpenPrivacyInfo,
}) => {
  const deviceLabels = {
    auto: "Автовыбор (GPU → CPU)",
    cuda: "Видеокарта NVIDIA",
    cpu: "Процессор (CPU)",
  };
  const selectorClasses = `flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface text-brand-text dark:text-dark-text transition-colors shadow-subtle shrink-0 ${
    controlsLocked
      ? "cursor-not-allowed opacity-70"
      : "hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
  }`;

  return (
    <header className="min-h-14 border-b border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface px-3 sm:px-4 py-2 flex items-center justify-between gap-3 select-none shrink-0 z-20">
      {/* Inline Configuration Selectors (Concept A) */}
      <div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
        {controlsLocked && (
          <span
            className="hidden 2xl:inline-flex items-center gap-1 rounded-lg bg-black/5 px-2 py-1.5 text-[11px] text-brand-text-secondary dark:bg-white/5 dark:text-dark-text-secondary"
            title="Параметры зафиксированы для текущего контекста"
          >
            <LockKeyhole size={12} />
            {contextLabel || "Параметры зафиксированы"}
          </span>
        )}
        {/* Model Selector */}
        <button
          onClick={onOpenModels}
          disabled={controlsLocked}
          className={selectorClasses}
          title={controlsLocked ? "Модель зафиксирована для текущей записи" : "Выбрать модель"}
        >
          <SlidersHorizontal size={13} className="text-brand-text-secondary" />
          <span className="text-brand-text-secondary dark:text-dark-text-secondary hidden xl:inline">Модель:</span>
          <span className="font-medium max-w-[90px] xl:max-w-[140px] truncate">{modelName}</span>
          {!controlsLocked && <ChevronDown size={12} className="text-brand-text-secondary opacity-70" />}
        </button>

        {/* Device Selector */}
        <button
          onClick={onToggleDevice}
          disabled={controlsLocked}
          className={selectorClasses}
          title={controlsLocked ? "Устройство зафиксировано для текущей записи" : "Переключить: Автовыбор → NVIDIA → CPU"}
        >
          <Cpu size={13} className="text-brand-text-secondary" />
          <span className="text-brand-text-secondary dark:text-dark-text-secondary hidden xl:inline">Устройство:</span>
          <span className="font-medium max-w-[170px] truncate">{deviceLabel || deviceLabels[devicePreference]}</span>
          {!controlsLocked && <ChevronDown size={12} className="text-brand-text-secondary opacity-70" />}
        </button>

        {/* Dictionary Selector */}
        <button
          onClick={onOpenDictionaries}
          disabled={controlsLocked}
          className={selectorClasses}
          title={controlsLocked ? "Словарь зафиксирован для текущей записи" : "Выбрать словарь"}
        >
          <BookOpen size={13} className="text-brand-text-secondary" />
          <span className="text-brand-text-secondary dark:text-dark-text-secondary hidden xl:inline">Словарь:</span>
          <span className="max-w-[85px] xl:max-w-[130px] truncate font-medium">{dictionaryName}</span>
          {!controlsLocked && <ChevronDown size={12} className="text-brand-text-secondary opacity-70" />}
        </button>
      </div>

      {/* Right Status & Tools */}
      <div className="flex items-center gap-1.5 shrink-0 pl-2">
        <Badge variant="success" onClick={onOpenPrivacyInfo}>
          <span className="hidden 2xl:inline">Локальная обработка (на этом компьютере)</span>
          <span className="2xl:hidden">Локально</span>
        </Badge>

        <button
          onClick={onToggleTheme}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

      </div>
    </header>
  );
};
