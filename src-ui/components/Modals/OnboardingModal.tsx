import React from "react";
import { Modal } from "../Modal";
import { BookOpen, FolderOpen, Headphones, Lock, CheckCircle2, AudioLines } from "lucide-react";
import { Button } from "../Button";

export interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Как устроен VoxNote" maxWidth="2xl">
      <div className="space-y-5 text-xs text-brand-text dark:text-dark-text">
        {/* Hero header */}
        <div className="p-4 rounded-xl bg-brand-primary-light/60 dark:bg-dark-primary-light/30 border border-brand-primary/20 flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center text-white shrink-0 shadow-subtle">
            <AudioLines size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-brand-text dark:text-dark-text flex items-center gap-2">
              <span>Сфокусированное рабочее пространство</span>
              <span className="px-2 py-0.5 text-[10px] bg-brand-primary text-white rounded-full font-medium">Концепт A</span>
            </h3>
            <p className="text-brand-text-secondary dark:text-dark-text-secondary mt-1 leading-relaxed">
              VoxNote создан для быстрой расшифровки аудиозаписей, лекций и ведения структурированных конспектов без отвлекающих деталей и полностью офлайн.
            </p>
          </div>
        </div>

        {/* 3-Column guide cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Card 1: Левая колонка */}
          <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-brand-primary">
              <FolderOpen size={16} />
              <span>1. Библиотека</span>
            </div>
            <p className="text-brand-text-secondary dark:text-dark-text-secondary leading-relaxed">
              Левая панель хранит историю всех лекций. Нажмите <kbd className="px-1 py-0.5 bg-black/5 dark:bg-white/5 rounded border text-[10px] font-mono">Ctrl+N</kbd> для нового файла или <kbd className="px-1 py-0.5 bg-black/5 dark:bg-white/5 rounded border text-[10px] font-mono">Ctrl+K</kbd> для мгновенного поиска по тексту.
            </p>
          </div>

          {/* Card 2: Центральная колонка */}
          <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-brand-primary">
              <BookOpen size={16} />
              <span>2. Конспект</span>
            </div>
            <p className="text-brand-text-secondary dark:text-dark-text-secondary leading-relaxed">
              В центре — структурированный результат: краткое резюме, ключевые тезисы и полный конспект с редактором форматирования и автосохранением.
            </p>
          </div>

          {/* Card 3: Правая колонка */}
          <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-brand-primary">
              <Headphones size={16} />
              <span>3. Таймлайн</span>
            </div>
            <p className="text-brand-text-secondary dark:text-dark-text-secondary leading-relaxed">
              Справа — кликабельный таймлайн по фразам, встроенный плеер со звуковой волной, копирование и экспорт в <code className="text-brand-primary font-semibold">.txt</code> / <code className="text-brand-primary font-semibold">.md</code>.
            </p>
          </div>
        </div>

        {/* Feature highlight: 100% Offline */}
        <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-brand-primary/10 text-brand-primary flex items-center justify-center shrink-0">
              <Lock size={15} />
            </div>
            <div>
              <div className="font-semibold text-brand-text dark:text-dark-text">100% Локальная безопасность</div>
              <div className="text-[11px] text-brand-text-secondary dark:text-dark-text-secondary">
                Звук и расшифровка обрабатываются на вашей NVIDIA GPU или CPU и никогда не покидают компьютер.
              </div>
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="flex justify-end pt-2">
          <Button variant="primary" size="md" onClick={onClose} icon={<CheckCircle2 size={15} />}>
            Понятно, начать работу
          </Button>
        </div>
      </div>
    </Modal>
  );
};
