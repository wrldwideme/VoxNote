import React, { useRef, useState } from "react";
import {
  BookOpenText,
  FileText,
  History,
  Sparkles,
  Bold,
  Italic,
  Heading2,
  List,
  ListOrdered,
  RotateCcw,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { HistoryEntry } from "../types/ipc";

export interface WorkspaceNoteProps {
  entry: HistoryEntry;
  isEditingMode?: boolean;
  onUpdateText: (newText: string) => void;
  onUpdateTitle: (newTitle: string) => void;
  onDeleteEntry?: (id: string) => void;
}

export const WorkspaceNote: React.FC<WorkspaceNoteProps> = ({
  entry,
  isEditingMode = true,
  onUpdateText,
  onUpdateTitle,
  onDeleteEntry,
}) => {
  const [activeTab, setActiveTab] = useState<"notes" | "transcript" | "history">("notes");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(entry.display_title);
  const [isCopied, setIsCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() && titleValue !== entry.display_title) {
      onUpdateTitle(titleValue.trim());
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(entry.current_text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const wordCount = entry.current_text.trim()
    ? entry.current_text.trim().split(/\s+/).filter(Boolean).length
    : 0;
  const charCount = entry.current_text.length;

  // Real markdown toolbar actions
  const applyWrap = (prefix: string, suffix: string = prefix) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = entry.current_text;
    const selected = text.slice(start, end) || "текст";
    const replacement = `${prefix}${selected}${suffix}`;
    const newText = text.slice(0, start) + replacement + text.slice(end);
    onUpdateText(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    }, 0);
  };

  const applyLinePrefix = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const text = entry.current_text;
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const newText = text.slice(0, lineStart) + prefix + text.slice(lineStart);
    onUpdateText(newText);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    }, 0);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto px-8 py-6 space-y-5 bg-brand-background dark:bg-dark-background">
      {/* 1. Header: Title, Subtitle Metadata, Actions */}
      <div className="space-y-2 border-b border-brand-border/60 dark:border-dark-border/60 pb-4">
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
                title="Нажмите для редактирования названия"
              >
                {entry.display_title}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface text-xs font-medium text-brand-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shadow-subtle"
            >
              {isCopied ? <Check size={13} className="text-brand-primary" /> : <Copy size={13} />}
              <span>{isCopied ? "Скопировано" : "Копировать"}</span>
            </button>

            {onDeleteEntry && (
              <button
                onClick={() => {
                  if (confirm(`Удалить запись "${entry.display_title}" из истории?`)) {
                    onDeleteEntry(entry.id);
                  }
                }}
                className="p-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface text-xs text-brand-text-secondary hover:text-brand-danger hover:border-brand-danger/30 transition-colors cursor-pointer shadow-subtle"
                title="Удалить запись"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Subtitle Metadata Line */}
        <div className="text-xs text-brand-text-secondary dark:text-dark-text-secondary flex flex-wrap items-center gap-2">
          <span>{entry.created_at}</span>
          <span>·</span>
          <span>{entry.duration_formatted}</span>
          <span>·</span>
          <span>Модель: {entry.model_id === "large-v3" ? "Максимальная точность" : entry.model_id}</span>
          <span>·</span>
          <span>Устройство: {entry.device}</span>
          {entry.dictionary_id && (
            <>
              <span>·</span>
              <span>Словарь: {entry.dictionary_id === "medical-ru" ? "Медицинская лекция" : entry.dictionary_id}</span>
            </>
          )}
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-brand-border/40 dark:border-dark-border/40 pb-2">
        <div className="flex items-center gap-2">
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
            <span>Исходный текст</span>
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
            <span>История правок</span>
          </button>
        </div>

        {/* Text statistics */}
        <div className="text-[11px] text-brand-text-secondary tabular-nums pr-1">
          {wordCount} слов · {charCount} симв.
        </div>
      </div>

      {/* 3. Main Content: Notes Tab */}
      {activeTab === "notes" && (
        <div className="space-y-4 max-w-4xl">
          {/* Card 1: Краткое превью */}
          {entry.preview && (
            <div className="p-4 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-primary">
                <Sparkles size={14} />
                <span>Начало записи</span>
              </div>
              <p className="text-xs text-brand-text dark:text-dark-text leading-relaxed">
                {entry.preview}
              </p>
            </div>
          )}

          {/* Card 2: Полный конспект */}
          <div className="p-4 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-3">
            <div className="flex items-center justify-between border-b border-brand-border/60 dark:border-dark-border/60 pb-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-text dark:text-dark-text">
                <FileText size={15} className="text-brand-primary" />
                <span>Текст конспекта</span>
              </div>

              {/* Working Markdown Formatting Toolbar */}
              {isEditingMode && (
                <div className="flex items-center gap-1 text-brand-text-secondary">
                  <button
                    onClick={() => applyLinePrefix("## ")}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                    title="Заголовок (##)"
                  >
                    <Heading2 size={14} />
                  </button>
                  <button
                    onClick={() => applyWrap("**")}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer font-bold"
                    title="Жирный текст (**)"
                  >
                    <Bold size={13} />
                  </button>
                  <button
                    onClick={() => applyWrap("*")}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer italic"
                    title="Курсив (*)"
                  >
                    <Italic size={13} />
                  </button>
                  <span className="w-px h-3.5 bg-brand-border mx-1" />
                  <button
                    onClick={() => applyLinePrefix("- ")}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                    title="Маркированный список (- )"
                  >
                    <List size={14} />
                  </button>
                  <button
                    onClick={() => applyLinePrefix("1. ")}
                    className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
                    title="Нумерованный список (1. )"
                  >
                    <ListOrdered size={14} />
                  </button>
                  {entry.has_edits && (
                    <button
                      onClick={() => {
                        if (confirm("Сбросить все правки и восстановить оригинальный текст распознавания?")) {
                          onUpdateText(entry.text);
                        }
                      }}
                      className="p-1 rounded hover:bg-brand-danger/10 text-brand-text-secondary hover:text-brand-danger cursor-pointer ml-1"
                      title="Сбросить правки к оригиналу"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Editable or Preview text */}
            {isEditingMode ? (
              <textarea
                ref={textareaRef}
                value={entry.current_text}
                onChange={(e) => onUpdateText(e.target.value)}
                className="w-full min-h-[360px] text-xs leading-relaxed text-brand-text dark:text-dark-text bg-transparent border-0 focus:outline-none resize-y font-sans selection:bg-brand-primary-light"
                placeholder="Текст лекции..."
              />
            ) : (
              <div className="w-full min-h-[360px] text-xs leading-relaxed text-brand-text dark:text-dark-text whitespace-pre-wrap select-text font-sans">
                {entry.current_text}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Raw Transcript */}
      {activeTab === "transcript" && (
        <div className="max-w-4xl p-5 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-3">
          <div className="flex items-center justify-between border-b border-brand-border/40 pb-2">
            <span className="text-xs font-semibold text-brand-text-secondary">
              Неизменяемый исходный результат модели ({entry.model_id}):
            </span>
          </div>
          <div className="text-xs leading-relaxed text-brand-text dark:text-dark-text whitespace-pre-wrap select-text font-sans">
            {entry.text}
          </div>
        </div>
      )}

      {/* Tab: History versions */}
      {activeTab === "history" && (
        <div className="max-w-4xl p-5 rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle space-y-3 text-xs">
          <div className="font-semibold text-brand-text dark:text-dark-text">История изменений</div>
          <div className="text-brand-text-secondary">
            {entry.has_edits ? (
              <div className="space-y-2">
                <p>Текст был изменён пользователем и автоматически сохранён в локальную базу данных.</p>
                <button
                  onClick={() => {
                    if (confirm("Сбросить правки и восстановить оригинальный текст?")) {
                      onUpdateText(entry.text);
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg border border-brand-border bg-brand-surface text-brand-danger font-medium hover:bg-brand-danger/10 cursor-pointer"
                >
                  Восстановить исходный текст модели
                </button>
              </div>
            ) : (
              <p>Текст совпадает с оригинальной транскрибацией модели (нет сохранённых правок).</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
