import React, { useRef } from "react";
import { Check, Upload, Trash2 } from "lucide-react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { DictionaryOption } from "../../types/ipc";

export interface DictionaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  dictionaries: DictionaryOption[];
  onSelectDictionary: (dictId: string) => void;
  onImportCustomDictionary: (file: File) => void;
  onRemoveCustomDictionary: () => void;
}

export const DictionaryModal: React.FC<DictionaryModalProps> = ({
  isOpen,
  onClose,
  dictionaries,
  onSelectDictionary,
  onImportCustomDictionary,
  onRemoveCustomDictionary,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Терминологические словари"
      description="Словари подсказывают модели редкие термины, повышая точность расшифровки лекций."
      maxWidth="md"
    >
      <div className="space-y-3 py-1">
        {dictionaries.map((dict) => (
          <div
            key={dict.id}
            onClick={() => onSelectDictionary(dict.id)}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
              dict.selected
                ? "border-brand-primary bg-brand-primary-light/30 dark:bg-dark-primary-light/20"
                : "border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface hover:bg-black/5 dark:hover:bg-white/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-brand-text dark:text-dark-text">
                    {dict.name}
                  </h4>
                  {dict.term_count > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/5 dark:bg-white/10 text-brand-text-secondary">
                      {dict.term_count} терминов
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-brand-text-secondary dark:text-dark-text-secondary">
                  {dict.description}
                </p>
              </div>

              {dict.selected && (
                <div className="w-5 h-5 rounded-full bg-brand-primary text-white flex items-center justify-center shrink-0">
                  <Check size={12} />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Custom Dictionary Upload Button */}
        <div className="pt-2 border-t border-brand-border/60 dark:border-dark-border/60 flex items-center justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                onImportCustomDictionary(e.target.files[0]);
              }
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            icon={<Upload size={13} />}
          >
            Импортировать свой словарь (.txt)
          </Button>

          {dictionaries.some((d) => d.id === "custom" && d.available) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemoveCustomDictionary}
              className="text-brand-danger"
              icon={<Trash2 size={13} />}
            >
              Удалить
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
