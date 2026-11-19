import { useEffect, useState } from "react";
import { Cpu, Download, HardDrive, LockKeyhole, ShieldCheck, Sparkles, Zap } from "lucide-react";
import {
  RuntimeInstallProgress,
  RuntimeStatus,
  sidecarClient,
} from "../api/client";

export interface RuntimeSetupProps {
  status: RuntimeStatus;
  onReady: (status: RuntimeStatus) => void;
}

const formatSize = (bytes: number, fallback: string) =>
  bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(0)} МБ` : fallback;

const phaseLabel = (progress: RuntimeInstallProgress) => {
  const packageName = progress.package === "core" ? "движок" : "ускорение NVIDIA";
  if (progress.phase === "verifying") return `Проверяем ${packageName}…`;
  if (progress.phase === "extracting") return `Устанавливаем ${packageName}…`;
  if (progress.phase === "completed") return `${packageName} установлен`;
  return `Скачиваем ${packageName}…`;
};

export const RuntimeSetup = ({ status, onReady }: RuntimeSetupProps) => {
  const [progress, setProgress] = useState<RuntimeInstallProgress | null>(null);
  const [installingProfile, setInstallingProfile] = useState<"cpu" | "nvidia" | null>(
    status.installing ? "cpu" : null
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];
    void Promise.all([
      sidecarClient.onRuntimeInstallProgress((next) => {
        if (!disposed) setProgress(next);
      }),
      sidecarClient.onRuntimeInstallFinished((next) => {
        if (disposed) return;
        setInstallingProfile(null);
        setProgress(null);
        onReady(next);
      }),
      sidecarClient.onRuntimeInstallFailed((message) => {
        if (disposed) return;
        setInstallingProfile(null);
        setProgress(null);
        setError(message);
      }),
    ]).then((listeners) => cleanups.push(...listeners));
    return () => {
      disposed = true;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [onReady]);

  const install = async (profile: "cpu" | "nvidia") => {
    setError(null);
    setInstallingProfile(profile);
    try {
      await sidecarClient.installRuntime(profile);
    } catch (installError) {
      setInstallingProfile(null);
      setError(installError instanceof Error ? installError.message : String(installError));
    }
  };

  const totalForProfile = (profile: "cpu" | "nvidia") =>
    profile === "cpu"
      ? status.core_size_bytes
      : status.core_size_bytes + status.nvidia_size_bytes;

  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-background px-6 py-10 text-brand-text dark:bg-dark-background dark:text-dark-text">
      <div className="w-full max-w-4xl space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary text-white shadow-card">
            <Sparkles size={25} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Подготовим локальный движок VoxNote</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-brand-text-secondary dark:text-dark-text-secondary">
            Движок устанавливается один раз и остаётся на компьютере. Последующие обновления приложения будут маленькими и не станут повторно скачивать CUDA.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            disabled={Boolean(installingProfile)}
            onClick={() => void install("cpu")}
            className="group rounded-2xl border border-brand-border bg-brand-surface p-5 text-left shadow-subtle transition hover:-translate-y-0.5 hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-55 dark:border-dark-border dark:bg-dark-surface"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/5 text-brand-primary dark:bg-white/5">
                <Cpu size={20} />
              </div>
              <span className="rounded-full bg-black/5 px-2.5 py-1 text-[11px] font-semibold dark:bg-white/5">
                {formatSize(totalForProfile("cpu"), "около 150 МБ")}
              </span>
            </div>
            <h2 className="mt-4 text-base font-bold">Процессор (CPU)</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-brand-text-secondary">
              Работает на любом совместимом компьютере. Подходит как надёжный базовый вариант без тяжёлых NVIDIA-библиотек.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand-primary">
              <Download size={14} /> Установить движок
            </div>
          </button>

          <button
            type="button"
            disabled={Boolean(installingProfile)}
            onClick={() => void install("nvidia")}
            className="group relative overflow-hidden rounded-2xl border border-brand-primary/40 bg-brand-surface p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:border-brand-primary disabled:cursor-not-allowed disabled:opacity-55 dark:bg-dark-surface"
          >
            <div className="absolute right-0 top-0 rounded-bl-xl bg-brand-primary px-3 py-1 text-[10px] font-bold text-white">Рекомендуется для NVIDIA</div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary-light text-brand-primary dark:bg-dark-primary-light">
                <Zap size={20} />
              </div>
              <span className="mt-7 rounded-full bg-brand-primary-light px-2.5 py-1 text-[11px] font-semibold text-brand-primary dark:bg-dark-primary-light">
                {formatSize(totalForProfile("nvidia"), "около 650 МБ")}
              </span>
            </div>
            <h2 className="mt-4 text-base font-bold">Видеокарта NVIDIA</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-brand-text-secondary">
              Устанавливает базовый движок и CUDA-ускорение. Скачивается только один раз и значительно ускоряет длинные записи.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-brand-primary">
              <Download size={14} /> Установить с ускорением
            </div>
          </button>
        </div>

        {installingProfile && (
          <div className="rounded-2xl border border-brand-border bg-brand-surface p-4 shadow-subtle dark:border-dark-border dark:bg-dark-surface">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="font-semibold">{progress ? phaseLabel(progress) : "Начинаем установку…"}</span>
              <span className="tabular-nums font-bold text-brand-primary">{Math.round(progress?.percent ?? 0)}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-brand-primary transition-[width] duration-150" style={{ width: `${progress?.percent ?? 0}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-brand-text-secondary">
              <span>{progress?.phase === "downloading" ? "Можно отменить; незавершённый пакет не будет активирован." : "Проверяем и устанавливаем атомарно."}</span>
              <button type="button" onClick={() => void sidecarClient.cancelRuntimeInstall()} className="font-semibold text-brand-danger hover:underline">Отменить</button>
            </div>
          </div>
        )}

        {error && <div className="rounded-xl border border-brand-danger/30 bg-brand-danger/10 p-3 text-xs font-medium text-brand-danger">{error}</div>}

        <div className="grid gap-3 text-[11px] text-brand-text-secondary sm:grid-cols-3">
          <span className="flex items-center gap-2"><LockKeyhole size={14} className="text-brand-primary" /> Расшифровка остаётся локальной</span>
          <span className="flex items-center gap-2"><ShieldCheck size={14} className="text-brand-primary" /> SHA-256 проверяется до установки</span>
          <span className="flex items-center gap-2"><HardDrive size={14} className="text-brand-primary" /> Runtime хранится отдельно от приложения</span>
        </div>
      </div>
    </main>
  );
};
