import React, { useState } from "react";
import {
  BookOpenText,
  FileText,
  History,
  Sparkles,
  ListChecks,
  Undo2,
  Redo2,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  ChevronDown,
  Edit3,
  MoreHorizontal,
} from "lucide-react";
import { HistoryEntry } from "../types/ipc";

export interface WorkspaceNoteProps {
  entry: HistoryEntry;
  onUpdateText: (newText: string) => void;
  onUpdateTitle: (newTitle: string) => void;
}

export const WorkspaceNote: React.FC<WorkspaceNoteProps> = ({
  entry,
  onUpdateText,
  onUpdateTitle,
}) => {
  const [activeTab, setActiveTab] = useState<"notes" | "transcript" | "history">("notes");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(entry.display_title);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() && titleValue !== entry.display_title) {
      onUpdateTitle(titleValue.trim());
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto px-8 py-6 space-y-5 bg-brand-background dark:bg-dark-background">
      {/* 1. Header: Title, Editing dropdown, Subtitle Metadata (Concept A) */}
      <div className="space-y-1.5 border-b border-brand-border/60 dark:border-dark-border/60 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            {isEditingTitle ? (
              <input
                type="text"
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleSubmit}
                onKeyDown={(e) => e.key === "Enter" && handleTitleSubmit()}
                autoFocus
                className="text-2xl font-bold text-brand-text dark:text-dark-text bg-transparent border-b-2 border-brand-primary focus:outline-none w-full"
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                className="text-2xl font-bold tracking-tight text-brand-text dark:text-dark-text cursor-pointer hover:opacity-85 transition-opacity truncate"
                title="Нажмите для редактирования названия лекции"
              >
                {entry.display_title}
              </h1>
            )}
          </div>

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface text-xs font-medium text-brand-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shrink-0 shadow-subtle">
            <Edit3 size={13} className="text-brand-text-secondary" />
            <span>Редактирование</span>
            <ChevronDown size={13} className="text-brand-text-secondary opacity-70" />
          </button>
        </div>

        {/* Subtitle Metadata Line */}
        <div className="text-xs text-brand-text-secondary dark:text-dark-text-secondary flex items-center gap-2">
          <span>{entry.created_at}</span>
          <span>·</span>
          <span>{entry.duration_formatted}</span>
          <span>·</span>
          <span>Модель: {entry.model_id === "large-v3" ? "Максимальная точность" : entry.model_id}</span>
          {entry.dictionary_id && (
            <>
              <span>·</span>
              <span>Словарь: {entry.dictionary_id === "medical-ru" ? "Медицинская лекция" : entry.dictionary_id}</span>
            </>
          )}
        </div>
      </div>

      {/* 2. Navigation Tabs (Concept A: Конспект, Транскрипт, История версий) */}
      <div className="flex items-center gap-2 border-b border-brand-border/40 dark:border-dark-border/40 pb-2">
        <button
          onClick={() => setActiveTab("notes")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "notes"
              ? "bg-brand-primary-light dark:bg-dark-primary-light text-brand-primary"
              : "text-brand-text-secondary hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <BookOpenText size={15} />
          <span>Конспект</span>
        </button>

        <button
          onClick={() => setActiveTab("transcript")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "transcript"
              ? "bg-brand-primary-light dark:bg-dark-primary-light text-brand-primary"
              : "text-brand-text-secondary hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <FileText size={15} />
          <span>Транскрипт</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeTab === "history"
              ? "bg-brand-primary-light dark:bg-dark-primary-light text-brand-primary"
              : "text-brand-text-secondary hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5"
          }`}
        >
          <History size={15} />
          <span>История версий</span>
        </button>
      </div>

      {/* 3. Main Content: Structured Note Blocks (Concept A) */}
      {activeTab === "notes" && (
        <div className="space-y-4 max-w-4xl">
          {/* Card 1: Краткое содержание */}
          <div className="p-4 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-primary">
              <Sparkles size={15} />
              <span>Краткое содержание</span>
            </div>
            <p className="text-xs text-brand-text dark:text-dark-text leading-relaxed">
              {entry.preview ||
                "Обзор приложения GoodNotes, его возможностей для учебы и ведения конспектов. Рассматриваются ключевые сценарии: хранение учебников, рукописные и печатные конспекты, организация материалов и альтернативы."}
            </p>
          </div>

          {/* Card 2: Ключевые тезисы */}
          <div className="p-4 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-brand-text dark:text-dark-text">
              <ListChecks size={15} className="text-brand-primary" />
              <span>Ключевые тезисы</span>
            </div>
            <ul className="text-xs text-brand-text dark:text-dark-text space-y-1.5 leading-relaxed pl-1">
              <li className="flex items-start gap-2">
                <span className="text-brand-primary font-bold">•</span>
                <span>GoodNotes удобно для учебы: хранение учебников, поиск, рукописные и печатные конспекты.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-primary font-bold">•</span>
                <span>Текстовые конспекты удобно разделять по темам, чтобы материалы не смешивались.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-primary font-bold">•</span>
                <span>Рукописный и печатный конспект дополняют друг друга; лучший вариант — комбинировать.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-primary font-bold">•</span>
                <span>Есть ограничения: нет полноценного переноса текста между конспектами; возможны трудности с очень большими документами (например, ~600 страниц).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-brand-primary font-bold">•</span>
                <span>Альтернативы: Pages (на Apple) и Word (более универсальный); в PS Office подобного плана нет.</span>
              </li>
            </ul>
          </div>

          {/* Card 3: Полный конспект с панелью форматирования */}
          <div className="p-4 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-3">
            <div className="flex items-center justify-between border-b border-brand-border/60 dark:border-dark-border/60 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-text dark:text-dark-text">
                <FileText size={15} className="text-brand-primary" />
                <span>Полный конспект</span>
              </div>

              {/* Formatting Toolbar (Concept A: ↶ ↷ | H2 B I •≡ 1.≡ ···) */}
              <div className="flex items-center gap-1 text-brand-text-secondary">
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" title="Отменить (Ctrl+Z)">
                  <Undo2 size={13} />
                </button>
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" title="Повторить (Ctrl+Y)">
                  <Redo2 size={13} />
                </button>
                <span className="w-px h-3.5 bg-brand-border mx-1" />
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer flex items-center gap-0.5 text-xs font-medium" title="Подзаголовок">
                  <Heading2 size={13} />
                  <ChevronDown size={10} />
                </button>
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer font-bold" title="Жирный (Ctrl+B)">
                  <Bold size={13} />
                </button>
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer italic" title="Курсив (Ctrl+I)">
                  <Italic size={13} />
                </button>
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" title="Маркированный список">
                  <List size={13} />
                </button>
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" title="Нумерованный список">
                  <ListOrdered size={13} />
                </button>
                <button className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer" title="Другие стили">
                  <MoreHorizontal size={13} />
                </button>
              </div>
            </div>

            {/* Editable Text Body */}
            <textarea
              value={entry.current_text}
              onChange={(e) => onUpdateText(e.target.value)}
              className="w-full min-h-[300px] text-xs leading-relaxed text-brand-text dark:text-dark-text bg-transparent border-0 focus:outline-none resize-y font-sans selection:bg-brand-primary-light"
              placeholder="Текст лекции..."
            />
          </div>
        </div>
      )}

      {/* Tab: Transcript (Raw unedited) */}
      {activeTab === "transcript" && (
        <div className="max-w-4xl p-5 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-3">
          <div className="text-xs font-semibold text-brand-text-secondary">
            Неизменяемый исходный текст распознавания:
          </div>
          <div className="text-xs leading-relaxed text-brand-text dark:text-dark-text whitespace-pre-wrap select-text">
            {entry.text}
          </div>
        </div>
      )}

      {/* Tab: History versions */}
      {activeTab === "history" && (
        <div className="max-w-4xl p-5 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-3 text-xs">
          <div className="font-semibold text-brand-text dark:text-dark-text">История изменений</div>
          <div className="text-brand-text-secondary">
            {entry.has_edits
              ? "Пользовательские правки сохранены локально в сессионном хранилище."
              : "Текст совпадает с оригинальной транскрибацией (нет сохранённых правок)."}
          </div>
        </div>
      )}
    </div>
  );
};
