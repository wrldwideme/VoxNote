import React from "react";
import { ArrowRight, AudioLines, Clock3, FileAudio, Play, Plus, ShieldCheck } from "lucide-react";
import { HistoryEntry } from "../types/ipc";

export interface WorkspaceHomeProps {
  entries: HistoryEntry[];
  onNewFile: () => void;
  onOpenEntry: (id: string) => void;
}

const formatTotalDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.round(seconds)} сек`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} мин`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
};

const homeWaveform = [18, 32, 24, 46, 28, 54, 35, 62, 42, 30, 50, 38, 58, 34, 48, 25, 41, 20];

export const WorkspaceHome: React.FC<WorkspaceHomeProps> = ({ entries, onNewFile, onOpenEntry }) => {
  const recentEntries = entries.slice(0, 4);
  const stoppedEntry = entries.find((entry) => ["cancelled", "interrupted"].includes(entry.status));
  const totalDuration = entries.reduce((sum, entry) => sum + (entry.duration_seconds || 0), 0);

  return (
    <main className="flex-1 overflow-y-auto bg-brand-background px-6 py-8 dark:bg-dark-background sm:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-brand-primary/20 bg-brand-surface p-7 shadow-card dark:border-brand-primary/30 dark:bg-dark-surface sm:p-9">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-primary/10 blur-3xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_300px]">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-primary-light px-3 py-1.5 text-xs font-semibold text-brand-primary dark:bg-dark-primary-light">
                <ShieldCheck size={14} />
                Всё остаётся на этом компьютере
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-brand-text dark:text-dark-text sm:text-4xl">
                Превратите запись в текст,
                <span className="block text-brand-primary">не отдавая её облаку.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-brand-text-secondary dark:text-dark-text-secondary">
                Лекции, интервью и голосовые заметки — локально, с привычным аудиоплеером и сохранением результата в библиотеке.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onNewFile}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-subtle transition-colors hover:bg-brand-primary-hover"
                >
                  <Plus size={16} />
                  Расшифровать аудио
                </button>
                {stoppedEntry && (
                  <button
                    type="button"
                    onClick={() => onOpenEntry(stoppedEntry.id)}
                    className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-brand-surface px-4 py-2.5 text-sm font-semibold text-brand-text transition-colors hover:bg-black/5 dark:border-dark-border dark:bg-dark-surface dark:text-dark-text dark:hover:bg-white/5"
                  >
                    <Play size={15} className="fill-current text-brand-primary" />
                    Продолжить остановленную
                  </button>
                )}
              </div>
            </div>

            <div className="hidden rounded-2xl border border-brand-border/70 bg-brand-background/80 p-5 dark:border-dark-border dark:bg-dark-background/70 lg:block">
              <div className="mb-4 flex items-center justify-between text-xs text-brand-text-secondary">
                <span>Локальный звук</span>
                <AudioLines size={16} className="text-brand-primary" />
              </div>
              <div className="flex h-24 items-center justify-center gap-1">
                {homeWaveform.map((height, index) => (
                  <span
                    key={index}
                    className="w-1.5 rounded-full bg-brand-primary"
                    style={{ height: `${height}px`, opacity: 0.35 + index / 32 }}
                  />
                ))}
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-brand-border/70 dark:bg-dark-border">
                <div className="h-full w-2/3 rounded-full bg-brand-primary" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-brand-border bg-brand-surface p-4 shadow-subtle dark:border-dark-border dark:bg-dark-surface">
            <FileAudio size={17} className="text-brand-primary" />
            <div className="mt-3 text-2xl font-bold tabular-nums">{entries.length}</div>
            <div className="text-xs text-brand-text-secondary">записей в библиотеке</div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-surface p-4 shadow-subtle dark:border-dark-border dark:bg-dark-surface">
            <Clock3 size={17} className="text-brand-primary" />
            <div className="mt-3 text-2xl font-bold tabular-nums">{formatTotalDuration(totalDuration)}</div>
            <div className="text-xs text-brand-text-secondary">общая длительность записей</div>
          </div>
          <div className="rounded-2xl border border-brand-border bg-brand-surface p-4 shadow-subtle dark:border-dark-border dark:bg-dark-surface">
            <Play size={17} className="text-brand-primary" />
            <div className="mt-3 text-2xl font-bold tabular-nums">
              {entries.filter((entry) => ["cancelled", "interrupted"].includes(entry.status)).length}
            </div>
            <div className="text-xs text-brand-text-secondary">можно продолжить</div>
          </div>
        </section>

        <section className="rounded-2xl border border-brand-border bg-brand-surface p-5 shadow-subtle dark:border-dark-border dark:bg-dark-surface">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold">Недавние записи</h2>
              <p className="mt-0.5 text-xs text-brand-text-secondary">Быстрый возврат к последней работе</p>
            </div>
          </div>

          {recentEntries.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {recentEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onOpenEntry(entry.id)}
                  className="group flex items-center gap-3 rounded-xl border border-brand-border/70 p-3 text-left transition-colors hover:border-brand-primary/40 hover:bg-brand-primary-light/50 dark:border-dark-border dark:hover:bg-dark-primary-light/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary-light text-brand-primary dark:bg-dark-primary-light">
                    <AudioLines size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{entry.display_title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-brand-text-secondary">
                      {entry.created_at} · {entry.duration_formatted}
                      {entry.status === "cancelled" ? " · Остановлено" : entry.status === "interrupted" ? " · Прервана" : ""}
                    </span>
                  </span>
                  <ArrowRight size={15} className="shrink-0 text-brand-text-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={onNewFile}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-border px-4 py-8 text-xs font-medium text-brand-text-secondary transition-colors hover:border-brand-primary/50 hover:text-brand-primary dark:border-dark-border"
            >
              <Plus size={15} />
              Здесь появятся ваши расшифровки. Начать первую
            </button>
          )}
        </section>
      </div>
    </main>
  );
};
