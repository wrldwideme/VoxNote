import React from "react";
import { ShieldCheck, HardDrive, WifiOff } from "lucide-react";
import { Modal } from "../Modal";
import { Button } from "../Button";

export interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Локальная обработка и приватность"
      maxWidth="md"
    >
      <div className="space-y-4 py-1 text-xs text-brand-text dark:text-dark-text leading-relaxed">
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-brand-primary-light/40 dark:bg-dark-primary-light/20 border border-brand-primary/20">
          <ShieldCheck size={20} className="text-brand-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-brand-text dark:text-dark-text">100% приватность данных</h4>
            <p className="text-brand-text-secondary dark:text-dark-text-secondary">
              Ваши аудиофайлы, словари и готовые расшифровки никогда не отправляются на удалённые серверы. Всё распознавание выполняется непосредственно на процессоре или видеокарте вашего компьютера.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <WifiOff size={15} className="text-brand-primary" />
            <span>Офлайн-работа</span>
          </div>
          <p className="text-brand-text-secondary dark:text-dark-text-secondary pl-6">
            После первоначальной загрузки весов модели подключение к интернету для распознавания речи больше не требуется.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 font-semibold">
            <HardDrive size={15} className="text-brand-primary" />
            <span>Локальное хранение</span>
          </div>
          <p className="text-brand-text-secondary dark:text-dark-text-secondary pl-6">
            История сессий, конспекты и пользовательские словари сохраняются локально в директории приложения на вашем диске.
          </p>
        </div>

        <div className="pt-3 flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            Понятно
          </Button>
        </div>
      </div>
    </Modal>
  );
};
