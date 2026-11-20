import React, { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, RefreshCw, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Modal } from "../Modal";
import { Button } from "../Button";
import { sidecarClient } from "../../api/client";

export interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentVersion: string;
}

interface ReleaseData {
  tagName: string;
  name: string;
  body: string;
  htmlUrl: string;
  publishedAt: string;
  assets: Array<{
    name: string;
    size: number;
    downloadUrl: string;
  }>;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  currentVersion,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [release, setRelease] = useState<ReleaseData | null>(null);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [installPercent, setInstallPercent] = useState(0);
  const updateHandleRef = useRef<any>(null);

  const cleanVersion = (v: string) => v.replace(/^v/i, "").trim();
  const isNewerVersion = (candidate: string, current: string) => {
    const candidateParts = cleanVersion(candidate).split(".").map((part) => Number.parseInt(part, 10) || 0);
    const currentParts = cleanVersion(current).split(".").map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(candidateParts.length, currentParts.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (candidateParts[index] || 0) - (currentParts[index] || 0);
      if (difference !== 0) return difference > 0;
    }
    return false;
  };

  const checkForUpdates = async () => {
    setIsChecking(true);
    setError(null);
    try {
      const isTauri = Boolean((window as any).__TAURI_INTERNALS__);
      if (isTauri) {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        updateHandleRef.current = update;
        if (!update) {
          setRelease(null);
          setIsUpdateAvailable(false);
          return;
        }
        setRelease({
          tagName: `v${update.version}`,
          name: `VoxNote ${update.version}`,
          body: update.body || "",
          htmlUrl: "https://github.com/wrldwideme/VoxNote/releases/latest",
          publishedAt: update.date ? new Date(update.date).toLocaleDateString("ru-RU") : "",
          assets: [],
        });
        setIsUpdateAvailable(true);
        return;
      }

      const response = await fetch("https://api.github.com/repos/wrldwideme/VoxNote/releases/latest", {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError("Релизов на GitHub пока не найдено.");
          setIsUpdateAvailable(false);
          return;
        }
        throw new Error(`GitHub API вернул статус ${response.status}`);
      }

      const data = await response.json();
      const latestTag = data.tag_name || "";
      const isNewer = latestTag !== "" && isNewerVersion(latestTag, currentVersion);

      const assets = (data.assets || []).map((a: any) => ({
        name: a.name,
        size: a.size,
        downloadUrl: a.browser_download_url,
      }));

      setRelease({
        tagName: latestTag,
        name: data.name || latestTag,
        body: data.body || "",
        htmlUrl: data.html_url || "https://github.com/wrldwideme/VoxNote/releases",
        publishedAt: data.published_at ? new Date(data.published_at).toLocaleDateString("ru-RU") : "",
        assets,
      });

      setIsUpdateAvailable(isNewer);
    } catch (err: any) {
      console.warn("Update check failed:", err);
      setError("Не удалось проверить обновления. Проверьте интернет-соединение.");
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (isOpen && isUpdateAvailable === null && !isChecking) {
      checkForUpdates();
    }
  }, [isOpen]);

  const handleOpenUrl = (url: string) => {
    sidecarClient.openExternalUrl(url);
  };

  const handleInstallUpdate = async () => {
    const update = updateHandleRef.current;
    if (!update) {
      if (release) handleOpenUrl(release.htmlUrl);
      return;
    }
    setIsInstalling(true);
    setError(null);
    setInstallPercent(0);
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event: any) => {
        if (event.event === "Started") {
          total = event.data.contentLength || 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength || 0;
          if (total > 0) setInstallPercent(Math.min(100, downloaded / total * 100));
        } else if (event.event === "Finished") {
          setInstallPercent(100);
        }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (installError) {
      setError(`Не удалось установить подписанное обновление: ${installError instanceof Error ? installError.message : installError}`);
      setIsInstalling(false);
    }
  };

  const formatSize = (bytes: number) => {
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Обновление VoxNote"
      description="Проверка новых релизов на GitHub с исправлениями и улучшениями."
      maxWidth="md"
    >
      <div className="space-y-4 py-1 text-xs">
        {/* Version Header Card */}
        <div className="p-3.5 rounded-xl border border-brand-border dark:border-dark-border bg-brand-surface dark:bg-dark-surface flex items-center justify-between">
          <div>
            <div className="font-semibold text-brand-text dark:text-dark-text">Текущая версия</div>
            <div className="text-[11px] text-brand-text-secondary dark:text-dark-text-secondary mt-0.5">
              v{cleanVersion(currentVersion)} (Windows x64)
            </div>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={checkForUpdates}
            disabled={isChecking}
            icon={<RefreshCw size={12} className={isChecking ? "animate-spin" : ""} />}
          >
            {isChecking ? "Проверка..." : "Проверить снова"}
          </Button>
        </div>

        {/* Results Area */}
        {error && (
          <div className="p-3.5 rounded-xl bg-brand-danger/10 border border-brand-danger/20 text-brand-danger flex items-start gap-2.5">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold">Ошибка проверки</div>
              <p className="text-[11px] opacity-90">{error}</p>
            </div>
          </div>
        )}

        {!isChecking && !error && isUpdateAvailable === false && (
          <div className="p-4 rounded-xl bg-brand-primary/10 border border-brand-primary/20 text-brand-primary flex items-start gap-3">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm">У вас последняя версия</div>
              <p className="text-xs text-brand-text dark:text-dark-text opacity-85">
                Вы используете актуальную версию VoxNote (v{cleanVersion(currentVersion)}). Новых обновлений пока нет.
              </p>
            </div>
          </div>
        )}

        {!isChecking && !error && isUpdateAvailable === true && release && (
          <div className="space-y-3 animate-in fade-in">
            <div className="p-4 rounded-xl bg-brand-primary/10 border border-brand-primary/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-brand-primary" />
                  <span className="font-bold text-sm text-brand-text dark:text-dark-text">
                    Доступно обновление {release.tagName}!
                  </span>
                </div>
                {release.publishedAt && (
                  <span className="text-[10px] text-brand-text-secondary">
                    Выпущено: {release.publishedAt}
                  </span>
                )}
              </div>

              {/* Release Notes Summary */}
              {release.body && (
                <div className="p-2.5 rounded-lg bg-brand-background/60 dark:bg-dark-background/60 max-h-36 overflow-y-auto text-[11px] text-brand-text dark:text-dark-text whitespace-pre-wrap leading-relaxed font-mono">
                  {release.body}
                </div>
              )}

              {/* Download Assets */}
              {release.assets.length > 0 && <div className="space-y-1.5 pt-1">
                <div className="text-[11px] font-semibold text-brand-text-secondary">Файлы для загрузки:</div>
                <div className="flex flex-col gap-1.5">
                  {release.assets.map((asset) => (
                    <div
                      key={asset.name}
                      onClick={() => handleOpenUrl(asset.downloadUrl)}
                      className="flex items-center justify-between p-2 rounded-lg bg-brand-surface dark:bg-dark-surface border border-brand-border/60 dark:border-dark-border/60 hover:border-brand-primary hover:bg-brand-primary-light/40 transition-colors cursor-pointer text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Download size={13} className="text-brand-primary shrink-0" />
                        <span className="font-medium text-brand-text dark:text-dark-text truncate">
                          {asset.name}
                        </span>
                      </div>
                      <span className="text-[11px] text-brand-text-secondary shrink-0 font-mono">
                        {formatSize(asset.size)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>}

              {isInstalling && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span>Скачиваем и проверяем подпись…</span>
                    <span className="tabular-nums">{Math.round(installPercent)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div className="h-full rounded-full bg-brand-primary transition-[width]" style={{ width: `${installPercent}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={onClose}
              >
                Позже
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleInstallUpdate()}
                disabled={isInstalling}
                icon={updateHandleRef.current ? <Download size={13} /> : <ExternalLink size={13} />}
              >
                {isInstalling ? "Установка…" : updateHandleRef.current ? "Скачать и установить" : "Открыть релиз на GitHub"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
