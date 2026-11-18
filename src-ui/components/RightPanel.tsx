import React, { useState } from "react";
import { Download, Copy, Check, ChevronDown, MoreHorizontal, Play, Volume2 } from "lucide-react";
import { Button } from "./Button";
import { AudioPlayer } from "./AudioPlayer";
import { TranscriptSegment } from "../types/ipc";

export interface RightPanelProps {
  segments: TranscriptSegment[];
  durationFormatted: string;
  onCopyText: () => void;
  onExportText: (format: "txt" | "markdown") => void;
  isAutosaved: boolean;
  onSeekSegment?: (seconds: number) => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  segments,
  durationFormatted,
  onCopyText,
  onExportText,
  isAutosaved,
  onSeekSegment,
}) => {
  const [isEditingMode, setIsEditingMode] = useState(true);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number | null>(0);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    onCopyText();
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <aside className="w-[300px] min-w-[280px] max-w-[340px] h-full border-l border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface flex flex-col justify-between p-4 select-none shrink-0 overflow-hidden">
      {/* Top: Actions & Toggle (Concept A) */}
      <div className="space-y-3.5">
        {/* Buttons: Export & Copy */}
        <div className="space-y-2">
          {/* Main Action: Экспортировать */}
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-brand-primary hover:bg-brand-primary-hover active:bg-[#3C563F] text-white text-xs font-semibold shadow-subtle transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Download size={15} />
                <span>Экспортировать</span>
              </div>
              <ChevronDown size={14} className="opacity-80" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1.5 p-1.5 bg-brand-surface dark:bg-dark-surface border border-brand-border dark:border-dark-border rounded-xl shadow-card z-30 space-y-0.5 animate-in fade-in duration-150">
                <button
                  onClick={() => {
                    onExportText("txt");
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-brand-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer font-medium transition-colors"
                >
                  Обычный текст (.txt)
                </button>
                <button
                  onClick={() => {
                    onExportText("markdown");
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-brand-text dark:text-dark-text hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer font-medium transition-colors"
                >
                  Документ Markdown (.md)
                </button>
              </div>
            )}
          </div>

          {/* Secondary Actions: Копировать текст + ··· */}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 text-xs py-2 rounded-xl"
              onClick={handleCopy}
              icon={isCopied ? <Check size={13} className="text-brand-primary" /> : <Copy size={13} />}
            >
              {isCopied ? "Скопировано!" : "Копировать текст"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="px-2.5 py-2 rounded-xl"
              title="Другие действия"
            >
              <MoreHorizontal size={14} />
            </Button>
          </div>
        </div>

        {/* Mode Switch & Autosave Status (Concept A) */}
        <div className="pt-2 border-t border-brand-border/60 dark:border-dark-border/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isEditingMode}
                onChange={(e) => setIsEditingMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4.5 bg-brand-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-brand-primary" />
            </label>
            <span className="text-xs font-semibold text-brand-text dark:text-dark-text">
              Редактирование
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-brand-primary font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
            <span>{isAutosaved ? "Изменения сохранены" : "Сохранение..."}</span>
          </div>
        </div>
      </div>

      {/* Middle: Transcript Timeline (Concept A) */}
      <div className="flex-1 my-3 overflow-hidden flex flex-col">
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <Volume2 size={13} className="text-brand-text-secondary" />
          <span className="text-xs font-semibold text-brand-text dark:text-dark-text">
            Транскрипт (таймлайн)
          </span>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {segments.length === 0 ? (
            <div className="text-xs text-brand-text-secondary py-6 text-center">
              Таймлайн формируется во время распознавания
            </div>
          ) : (
            segments.map((seg, idx) => {
              const isSelected = activeSegmentIndex === idx;
              const formatSec = (s: number) => {
                const mins = Math.floor(s / 60);
                const secs = Math.floor(s % 60);
                return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
              };

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setActiveSegmentIndex(idx);
                    onSeekSegment?.(seg.start);
                  }}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-all space-y-1 ${
                    isSelected
                      ? "bg-brand-primary-light/70 dark:bg-dark-primary-light/30 border-brand-primary/30 shadow-subtle"
                      : "bg-brand-background/40 dark:bg-dark-background/30 border-transparent hover:border-brand-border dark:hover:border-dark-border"
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-brand-primary font-semibold text-[11px] tabular-nums">
                    {isSelected ? (
                      <Play size={10} className="fill-brand-primary" />
                    ) : (
                      <span className="w-2.5" />
                    )}
                    <span>{formatSec(seg.start)}</span>
                  </div>
                  <p className="text-brand-text dark:text-dark-text leading-snug line-clamp-2 pl-4">
                    {seg.text}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Bottom: Audio Player (Concept A) */}
      <AudioPlayer durationFormatted={durationFormatted} />
    </aside>
  );
};
