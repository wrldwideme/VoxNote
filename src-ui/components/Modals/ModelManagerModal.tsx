import React, { useEffect, useState } from "react";
import { Check, Download, Trash2, Folder, FolderOpen, CheckCircle, RotateCcw } from "lucide-react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { ModelOption } from "../../types/ipc";
import { sidecarClient } from "../../api/client";

export interface ModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  models: ModelOption[];
  onSelectModel: (modelId: string) => void;
  onDownloadModel: (modelId: string) => void;
  onRemoveModel: (modelId: string) => void;
  downloadProgress?: {
    model_id: string;
    percent: number;
    downloaded_bytes: number;
    total_bytes: number;
  } | null;
  onCancelDownload?: (modelId: string) => void;
}

export const ModelManagerModal: React.FC<ModelManagerModalProps> = ({
  isOpen,
  onClose,
  models,
  onSelectModel,
  onDownloadModel,
  onRemoveModel,
  downloadProgress,
  onCancelDownload,
}) => {
  const [modelsPath, setModelsPath] = useState<string>("%LOCALAPPDATA%\\VoxNote\\models");
  const [isCustom, setIsCustom] = useState(false);
  const [isEditingPath, setIsEditingPath] = useState(false);
  const [inputPath, setInputPath] = useState("");
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      sidecarClient.getModelsDirectory().then((res) => {
        if (res.path) {
          setModelsPath(res.path);
          setIsCustom(res.is_custom);
          setInputPath(res.path);
        }
      });
    }
  }, [isOpen]);

  const handleSavePath = async () => {
    if (!inputPath.trim()) return;
    try {
      const res = await sidecarClient.setModelsDirectory(inputPath.trim());
      setModelsPath(res.path);
      setIsCustom(true);
      setIsEditingPath(false);
      setSaveStatus("Каталог сохранён!");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err: any) {
      alert(`Ошибка: ${err.message || err}`);
    }
  };

  const handleResetDefault = async () => {
    try {
      // Empty string resets to default
      const res = await sidecarClient.setModelsDirectory("");
      setModelsPath(res.path);
      setIsCustom(false);
      setIsEditingPath(false);
    } catch {
      // In mock mode fallback
      setModelsPath("%LOCALAPPDATA%\\VoxNote\\models");
      setIsCustom(false);
      setIsEditingPath(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Локальные модели распознавания"
      description="Интернет используется только один раз для загрузки. Распознавание работает полностью офлайн."
      maxWidth="lg"
    >
      <div className="space-y-4 py-1 text-xs">
        {/* Directory Picker Block (Concept A: куда скачивать модель) */}
        <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-brand-text dark:text-dark-text">
              <Folder size={15} className="text-brand-primary" />
              <span>Папка для скачивания моделей:</span>
              {isCustom && (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-brand-primary/10 text-brand-primary font-medium">
                  Свой путь
                </span>
              )}
            </div>

            {!isEditingPath ? (
              <Button size="sm" variant="ghost" onClick={() => setIsEditingPath(true)} icon={<FolderOpen size={13} />}>
                Изменить папку
              </Button>
            ) : (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" onClick={handleResetDefault} icon={<RotateCcw size={12} />} title="По умолчанию">
                  Сброс
                </Button>
                <Button size="sm" variant="primary" onClick={handleSavePath} icon={<CheckCircle size={13} />}>
                  Сохранить
                </Button>
              </div>
            )}
          </div>

          {!isEditingPath ? (
            <div className="font-mono text-[11px] text-brand-text-secondary dark:text-dark-text-secondary bg-black/[0.03] dark:bg-white/[0.04] p-2 rounded-lg break-all select-all">
              {modelsPath}
            </div>
          ) : (
            <div className="space-y-1.5">
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="Например: D:\AI\Models"
                autoFocus
                className="w-full px-3 py-1.5 text-xs bg-brand-background dark:bg-dark-background border border-brand-primary rounded-lg text-brand-text dark:text-dark-text focus:outline-none"
              />
              <p className="text-[11px] text-brand-text-secondary">
                Укажите любой удобный диск или папку, если на диске C: недостаточно места (модели весят от 486 МБ до 3.1 ГБ).
              </p>
            </div>
          )}

          {saveStatus && (
            <div className="text-[11px] text-brand-primary font-medium flex items-center gap-1">
              <Check size={13} />
              <span>{saveStatus}</span>
            </div>
          )}
        </div>

        {/* Models list */}
        <div className="space-y-2.5">
          {models.map((model) => (
            <div
              key={model.model_id}
              className={`p-3.5 rounded-xl border transition-all ${
                model.selected
                  ? "border-brand-primary bg-brand-primary-light/30 dark:bg-dark-primary-light/20 shadow-subtle"
                  : "border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-brand-text dark:text-dark-text">
                      {model.name}
                    </h4>
                    {model.recommended && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-primary text-white">
                        Рекомендуется
                      </span>
                    )}
                    {model.installed && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/5 dark:bg-white/10 text-brand-text-secondary dark:text-dark-text-secondary">
                        Установлена · {model.size_text}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-brand-text-secondary dark:text-dark-text-secondary leading-relaxed">
                    {model.summary}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {model.installed ? (
                    <>
                      {!model.selected && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onRemoveModel(model.model_id)}
                          className="text-brand-text-secondary hover:text-brand-danger"
                          title="Удалить модель"
                        >
                          <Trash2 size={13} />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={model.selected ? "primary" : "secondary"}
                        onClick={() => onSelectModel(model.model_id)}
                        disabled={model.selected}
                        icon={model.selected ? <Check size={13} /> : undefined}
                      >
                        {model.selected ? "Выбрана" : "Выбрать"}
                      </Button>
                    </>
                  ) : downloadProgress && downloadProgress.model_id === model.model_id ? (
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-brand-primary h-full transition-all duration-300"
                          style={{ width: `${downloadProgress.percent}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold tabular-nums text-brand-primary">
                        {Math.round(downloadProgress.percent)}%
                      </span>
                      {onCancelDownload && (
                        <button
                          onClick={() => onCancelDownload(model.model_id)}
                          className="text-[11px] text-brand-danger hover:underline ml-1 cursor-pointer"
                        >
                          Отмена
                        </button>
                      )}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => onDownloadModel(model.model_id)}
                      disabled={Boolean(downloadProgress)}
                      icon={<Download size={13} />}
                    >
                      Загрузить ({model.size_text})
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
