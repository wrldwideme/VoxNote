import React from "react";
import { Search, Plus, AudioLines, Settings, Clock, Play, HelpCircle, Trash2, Sparkles } from "lucide-react";
import { HistoryGroup } from "../types/ipc";

export interface SidebarProps {
  groups: HistoryGroup[];
  activeId: string | null;
  searchQuery: string;
  isNewActive: boolean;
  isHomeActive: boolean;
  homeDisabled?: boolean;
  onSearchChange: (q: string) => void;
  onSelectLecture: (id: string) => void;
  onNewFile: () => void;
  onOpenHome: () => void;
  onOpenSettings: () => void;
  onOpenOnboarding?: () => void;
  onDeleteEntry?: (id: string) => void;
  onOpenUpdates?: () => void;
  isUpdateAvailable?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  groups,
  activeId,
  searchQuery,
  isNewActive,
  isHomeActive,
  homeDisabled = false,
  onSearchChange,
  onSelectLecture,
  onNewFile,
  onOpenHome,
  onOpenSettings,
  onOpenOnboarding,
  onDeleteEntry,
  onOpenUpdates,
  isUpdateAvailable,
  searchInputRef,
}) => {
  return (
    <aside className="w-[260px] min-w-[220px] max-w-[280px] h-full border-r border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface flex flex-col justify-between select-none shrink-0 overflow-hidden">
      {/* Top Section: Logo, Search & New File Button */}
      <div className="p-4 border-b border-brand-border/60 dark:border-dark-border/60 space-y-3.5">
        {/* Brand Logo (matching Concept A mock) */}
        <button
          type="button"
          onClick={onOpenHome}
          disabled={homeDisabled}
          className={`flex items-center gap-2.5 rounded-lg text-left ${homeDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:opacity-80"}`}
          title={homeDisabled ? "Дождитесь завершения текущей операции" : "На главный экран"}
          aria-current={isHomeActive ? "page" : undefined}
        >
          <div className="w-7 h-7 rounded-lg bg-brand-primary flex items-center justify-center text-white shadow-subtle">
            <AudioLines size={16} />
          </div>
          <span className="text-base font-bold tracking-tight text-brand-text dark:text-dark-text">
            VoxNote
          </span>
        </button>

        {/* Search Input with Ctrl+K shortcut */}
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-2.5 text-brand-text-secondary opacity-70 pointer-events-none" />
          <input
            ref={searchInputRef as any}
            type="text"
            placeholder="Поиск по записям и тексту..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-8 pr-12 py-1.5 text-xs bg-brand-background dark:bg-dark-background border border-brand-border dark:border-dark-border rounded-lg text-brand-text dark:text-dark-text placeholder:text-brand-text-secondary/70 focus:outline-none focus:border-brand-primary transition-colors"
          />
          <span className="absolute right-2 px-1.5 py-0.5 text-[10px] font-mono text-brand-text-secondary dark:text-dark-text-secondary bg-black/5 dark:bg-white/5 rounded border border-brand-border/80 dark:border-dark-border">
            Ctrl K
          </span>
        </div>

        {/* Primary + Новый файл button (Concept A) */}
        <button
          onClick={onNewFile}
          className={`w-full py-2 px-3 flex items-center justify-center gap-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
            isNewActive
              ? "bg-brand-primary text-white shadow-card ring-2 ring-brand-primary/20"
              : "bg-brand-primary hover:bg-brand-primary-hover active:bg-[#3C563F] text-white shadow-subtle"
          }`}
        >
          <Plus size={15} />
          <span>Новый файл</span>
        </button>
      </div>

      {/* Center: Grouped History List */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        <div className="px-1 text-xs font-semibold text-brand-text-secondary dark:text-dark-text-secondary flex items-center gap-1.5">
          <Clock size={13} className="opacity-80" />
          <span>История</span>
        </div>

        {groups.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-brand-text-secondary">
            {searchQuery ? "Ничего не найдено" : "История пока пуста"}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.group_name} className="space-y-1">
              <div className="px-1 text-[11px] font-medium text-brand-text-secondary dark:text-dark-text-secondary">
                {group.group_name}
              </div>

              {group.entries.map((entry) => {
                const isSelected = !isHomeActive && !isNewActive && entry.id === activeId;
                return (
                  <div
                    key={entry.id}
                    onClick={() => onSelectLecture(entry.id)}
                    className={`group relative flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "bg-brand-primary-light dark:bg-dark-primary-light text-brand-text dark:text-dark-text font-medium shadow-subtle border border-brand-primary/20 dark:border-brand-primary/30"
                        : "text-brand-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-1">
                      {isSelected ? (
                        <div className="w-6 h-6 rounded-full bg-brand-primary/15 flex items-center justify-center text-brand-primary shrink-0">
                          <Play size={10} className="fill-brand-primary ml-0.5" />
                        </div>
                      ) : (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-brand-text-secondary shrink-0">
                          <AudioLines size={14} className="opacity-80" />
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="truncate font-medium text-[12px] leading-tight">
                          {entry.display_title}
                        </div>
                        <div className="text-[10px] text-brand-text-secondary dark:text-dark-text-secondary truncate mt-0.5">
                          {entry.created_at} · {entry.duration_formatted}
                        </div>
                        {(entry.status === "cancelled" || entry.status === "interrupted") && (
                          <div className="mt-1 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            {entry.status === "interrupted" ? "Прервана" : "Остановлено"}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Удалить запись "${entry.display_title}" из истории?`)) {
                          onDeleteEntry?.(entry.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-brand-danger/10 text-brand-text-secondary hover:text-brand-danger transition-all shrink-0 cursor-pointer"
                      title="Удалить из истории"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Bottom: Onboarding Guide, Settings & Updates buttons */}
      <div className="p-3 border-t border-brand-border/60 dark:border-dark-border/60 space-y-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenOnboarding}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            title="Вступительная инструкция: что и где устроено в VoxNote"
          >
            <HelpCircle size={14} className="shrink-0" />
            <span>Инструкция</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
            title="Настройки моделей и словарей"
          >
            <Settings size={14} className="shrink-0" />
            <span>Настройки</span>
          </button>
        </div>

        {onOpenUpdates && (
          <button
            onClick={onOpenUpdates}
            className={`w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              isUpdateAvailable
                ? "bg-brand-primary text-white hover:bg-brand-primary-hover shadow-subtle animate-pulse"
                : "text-brand-text-secondary dark:text-dark-text-secondary hover:text-brand-text dark:hover:text-dark-text hover:bg-black/5 dark:hover:bg-white/5"
            }`}
            title="Проверить наличие обновлений VoxNote на GitHub"
          >
            <Sparkles size={14} className={isUpdateAvailable ? "text-white" : "text-brand-primary"} />
            <span>{isUpdateAvailable ? "Доступно обновление!" : "Проверить обновления"}</span>
          </button>
        )}
      </div>
    </aside>
  );
};
