import React, { useState } from "react";
import {
  BookOpenText,
  FileText,
  History,
  Sparkles,
  Trash2,
  Copy,
  Check,
  CirclePause,
  Play,
  X,
} from "lucide-react";
import { HistoryEntry } from "../types/ipc";
import { RichTextEditor } from "./RichTextEditor";

const modelLabel = (modelId: string) => {
  if (modelId === "small") return "Быстрая (small)";
  if (modelId === "turbo" || modelId === "large-v3-turbo") return "Сбалансированная (turbo)";
  if (modelId === "large-v3") return "Максимальная точность (large-v3)";
  return modelId;
};

const deviceLabel = (device: string) => {
  if (device === "cuda") return "Видеокарта NVIDIA (CUDA)";
  if (device === "cpu") return "Процессор (CPU)";
  return device;
};

export interface WorkspaceNoteProps {
  entry: HistoryEntry;
  isEditingMode?: boolean;
  onUpdateText: (newText: string) => void;
  onUpdateTitle: (newTitle: string) => void;
  onDeleteEntry?: (id: string) => void;
  onResumeTranscription?: (entry: HistoryEntry) => void;
  onClose?: () => void;
  onRelinkAudio?: (entry: HistoryEntry) => void;
  relinkError?: string | null;
}

export const WorkspaceNote: React.FC<WorkspaceNoteProps> = ({
  entry,
  isEditingMode = true,
  onUpdateText,
  onUpdateTitle,
  onDeleteEntry,
  onResumeTranscription,
  onClose,
  onRelinkAudio,
  relinkError,
}) => {
  const [activeTab, setActiveTab] = useState<"notes" | "transcript" | "history">("notes");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(entry.display_title);
  const [isCopied, setIsCopied] = useState(false);

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
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface text-brand-text-secondary hover:text-brand-text hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer shadow-subtle"
                title="Закрыть заметку"
                aria-label="Закрыть заметку"
              >
                <X size={14} />
              </button>
            )}
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
          <span>Модель: {modelLabel(entry.model_id)}</span>
          <span>·</span>
          <span>Устройство: {deviceLabel(entry.device)}</span>
          {entry.dictionary_id && (
            <>
              <span>·</span>
              <span>Словарь: {entry.dictionary_id === "medical-ru" ? "Медицинская лекция" : entry.dictionary_id}</span>
            </>
          )}
          {(entry.status === "cancelled" || entry.status === "interrupted") && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <CirclePause size={12} />
              {entry.status === "interrupted" ? "Прервана" : "Остановлено"}
            </span>
          )}
        </div>
      </div>

      {(entry.status === "cancelled" || entry.status === "interrupted") && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300/70 bg-amber-50 p-3.5 text-xs dark:border-amber-700/60 dark:bg-amber-950/20">
          <div>
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              {entry.status === "interrupted" ? "Транскрибация была прервана" : "Транскрибация остановлена"}
            </div>
            <div className="mt-0.5 text-amber-800/80 dark:text-amber-300/80">
              Распознанный текст сохранён. Продолжение начнётся с {Math.round(entry.resume_from_seconds)} сек.
            </div>
          </div>
          <button
            type="button"
            onClick={() => onResumeTranscription?.(entry)}
            disabled={!onResumeTranscription || !entry.file_path || !entry.file_available}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 font-semibold text-white hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={13} className="fill-current" />
            Продолжить
          </button>
        </div>
      )}

      {!entry.file_available && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-300/70 bg-amber-50 p-3.5 text-xs dark:border-amber-700/60 dark:bg-amber-950/20">
          <div>
            <div className="font-semibold text-amber-900 dark:text-amber-200">Исходный аудиофайл перемещён или удалён</div>
            <div className="mt-0.5 text-amber-800/80 dark:text-amber-300/80">Текст доступен, но воспроизведение и продолжение требуют исходного файла.</div>
          </div>
          <button type="button" onClick={() => onRelinkAudio?.(entry)} className="shrink-0 rounded-lg bg-brand-primary px-3 py-2 font-semibold text-white hover:bg-brand-primary-hover">
            Указать файл
          </button>
        </div>
      )}

      {relinkError && (
        <div className="rounded-xl border border-brand-danger/30 bg-brand-danger/10 p-3.5 text-xs font-medium text-brand-danger">
          {relinkError}
        </div>
      )}

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
          <div className="rounded-xl bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border shadow-subtle overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border/60 dark:border-dark-border/60">
              <div className="flex items-center gap-2 text-xs font-semibold text-brand-text dark:text-dark-text">
                <FileText size={15} className="text-brand-primary" />
                <span>Текст конспекта</span>
              </div>
              <span className="text-[11px] text-brand-text-secondary">
                {isEditingMode ? "Редактирование" : "Только чтение"}
              </span>
            </div>
            <RichTextEditor
              value={entry.current_text}
              onChange={onUpdateText}
              editable={isEditingMode}
              hasEdits={entry.has_edits}
              onRestoreOriginal={() => {
                if (confirm("Сбросить все правки и восстановить оригинальный текст распознавания?")) {
                  onUpdateText(entry.text);
                }
              }}
            />
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
            {(entry.revisions || []).length > 0 ? (
              <div className="space-y-2">
                <p>VoxNote хранит до 20 последних локальных версий текста.</p>
                {entry.revisions.map((revision, index) => (
                  <div key={`${revision.created_at}-${index}`} className="flex items-start justify-between gap-3 rounded-xl border border-brand-border/70 p-3 dark:border-dark-border">
                    <div className="min-w-0">
                      <div className="font-semibold text-brand-text dark:text-dark-text">Версия от {revision.created_at}</div>
                      <p className="mt-1 line-clamp-2 leading-relaxed">{revision.text || "Пустой текст"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdateText(revision.text)}
                      className="shrink-0 rounded-lg border border-brand-border px-2.5 py-1.5 font-semibold text-brand-text hover:bg-black/5 dark:border-dark-border dark:text-dark-text dark:hover:bg-white/5"
                    >
                      Восстановить
                    </button>
                  </div>
                ))}
                {entry.has_edits && (
                  <button
                    type="button"
                    onClick={() => onUpdateText(entry.text)}
                    className="px-3 py-1.5 rounded-lg border border-brand-border bg-brand-surface text-brand-danger font-medium hover:bg-brand-danger/10 cursor-pointer"
                  >
                    Восстановить исходный текст модели
                  </button>
                )}
              </div>
            ) : (
              <p>Сохранённых версий пока нет. Они появятся после первой правки текста.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
