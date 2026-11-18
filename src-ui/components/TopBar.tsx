import React from "react";
import { ChevronDown, Info, Moon, Sun, Cpu, SlidersHorizontal, BookOpen, Minus, Square, X, Sparkles } from "lucide-react";
import { Badge } from "./Badge";
import { DevicePreference, ThemeMode } from "../types/ipc";

export interface TopBarProps {
  modelName: string;
  devicePreference: DevicePreference;
  dictionaryName: string;
  theme: ThemeMode;
  onOpenModels: () => void;
  onOpenDictionaries: () => void;
  onToggleDevice: () => void;
  onToggleTheme: () => void;
  onOpenPrivacyInfo: () => void;
  onOpenUpdates?: () => void;
  isUpdateAvailable?: boolean;
  onMinimizeWindow?: () => void;
  onMaximizeWindow?: () => void;
  onCloseWindow?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  modelName,
  devicePreference,
  dictionaryName,
  theme,
  onOpenModels,
  onOpenDictionaries,
  onToggleDevice,
  onToggleTheme,
  onOpenPrivacyInfo,
  onOpenUpdates,
  isUpdateAvailable,
  onMinimizeWindow,
  onMaximizeWindow,
  onCloseWindow,
}) => {
  const deviceLabels = {
    auto: "Авто",
    cuda: "NVIDIA",
    cpu: "CPU",
  };

  return (
    <header className="h-13 border-b border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface px-3 sm:px-4 flex items-center justify-between select-none shrink-0 z-20">
      {/* Inline Configuration Selectors (Concept A) */}
      <div className="flex items-center gap-1.5 text-xs font-medium min-w-0">
        {/* Model Selector */}
        <button
          onClick={onOpenModels}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface hover:bg-black/5 dark:hover:bg-white/5 text-brand-text dark:text-dark-text transition-colors cursor-pointer shadow-subtle shrink-0"
        >
          <SlidersHorizontal size={13} className="text-brand-text-secondary" />
          <span className="text-brand-text-secondary dark:text-dark-text-secondary hidden xl:inline">Модель:</span>
          <span className="font-medium max-w-[90px] xl:max-w-[140px] truncate">{modelName}</span>
          <ChevronDown size={12} className="text-brand-text-secondary opacity-70" />
        </button>

        {/* Device Selector */}
        <button
          onClick={onToggleDevice}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface hover:bg-black/5 dark:hover:bg-white/5 text-brand-text dark:text-dark-text transition-colors cursor-pointer shadow-subtle shrink-0"
          title="Нажмите для переключения: Авто -> NVIDIA -> CPU"
        >
          <Cpu size={13} className="text-brand-text-secondary" />
          <span className="text-brand-text-secondary dark:text-dark-text-secondary hidden xl:inline">Устройство:</span>
          <span className="font-medium">{deviceLabels[devicePreference]}</span>
          <ChevronDown size={12} className="text-brand-text-secondary opacity-70" />
        </button>

        {/* Dictionary Selector */}
        <button
          onClick={onOpenDictionaries}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface hover:bg-black/5 dark:hover:bg-white/5 text-brand-text dark:text-dark-text transition-colors cursor-pointer shadow-subtle shrink-0"
        >
          <BookOpen size={13} className="text-brand-text-secondary" />
          <span className="text-brand-text-secondary dark:text-dark-text-secondary hidden xl:inline">Словарь:</span>
          <span className="max-w-[85px] xl:max-w-[130px] truncate font-medium">{dictionaryName}</span>
          <ChevronDown size={12} className="text-brand-text-secondary opacity-70" />
        </button>
      </div>

      {/* Right Status & Tools */}
      <div className="flex items-center gap-1.5 shrink-0 pl-2">
        <Badge variant="success" onClick={onOpenPrivacyInfo}>
          <span className="hidden 2xl:inline">Локальная обработка (на этом компьютере)</span>
          <span className="2xl:hidden">Локально</span>
        </Badge>

        <button
          onClick={onOpenPrivacyInfo}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          title="Справка о локальной приватности"
        >
          <Info size={15} />
        </button>

        {isUpdateAvailable && onOpenUpdates && (
          <button
            onClick={onOpenUpdates}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-primary text-white text-xs font-semibold shadow-subtle hover:bg-brand-primary-hover transition-all cursor-pointer animate-pulse"
            title="Доступно новое обновление VoxNote! Нажмите для просмотра"
          >
            <Sparkles size={13} />
            <span>Обновление!</span>
          </button>
        )}

        <button
          onClick={onToggleTheme}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
          title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Windows Desktop Frame Controls */}
        <div className="flex items-center ml-1 border-l border-brand-border/60 dark:border-dark-border/60 pl-2 gap-0.5">
          <button
            onClick={onMinimizeWindow}
            className="w-6 h-6 rounded flex items-center justify-center text-brand-text-secondary hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Свернуть"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={onMaximizeWindow}
            className="w-6 h-6 rounded flex items-center justify-center text-brand-text-secondary hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            title="Развернуть"
          >
            <Square size={11} />
          </button>
          <button
            onClick={onCloseWindow}
            className="w-6 h-6 rounded flex items-center justify-center text-brand-text-secondary hover:text-brand-danger hover:bg-brand-danger/10 transition-colors"
            title="Закрыть"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </header>
  );
};
